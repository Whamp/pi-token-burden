import { spawn } from 'node:child_process';

import { EXCLUSION_LABELS, IMPLEMENTATION_LABELS } from './constants.js';
import { selectNextEligibleIssue, isIssueClaimable } from './routing.js';
import {
  decodeJson,
  decodeValue,
  GITHUB_ISSUE_LIST_SCHEMA,
  GITHUB_ISSUE_SCHEMA,
} from './schema.js';
import type { CommandResult, GitHubExecutor, RoutedIssue } from './types.js';

const ISSUE_FIELDS = 'assignees,body,createdAt,labels,number,state,title';
const BASE_SEARCH = [
  'is:issue',
  'is:open',
  'label:ready-for-agent',
  'no:assignee',
  ...Array.from(EXCLUSION_LABELS, (label) => `-label:${label}`),
].join(' ');
function nativeBlockerCount(result: CommandResult): number | undefined {
  if (result.exitCode !== 0) {
    return undefined;
  }
  const count = Number.parseInt(result.stdout.trim(), 10);
  return Number.isSafeInteger(count) ? count : undefined;
}

function issueViewArgs(repository: string, issueNumber: number): readonly string[] {
  return ['issue', 'view', String(issueNumber), '--repo', repository, '--json', ISSUE_FIELDS];
}

function nativeBlockerArgs(repository: string, issueNumber: number): readonly string[] {
  return [
    'api',
    `repos/${repository}/issues/${issueNumber}`,
    '--jq',
    '.issue_dependencies_summary.blocked_by // 0',
  ];
}

function fallbackBlockerNumbers(snapshot: unknown): number[] {
  const issue = decodeValue(GITHUB_ISSUE_SCHEMA, snapshot);
  if (issue === undefined) {
    return [];
  }
  const firstLine = issue.body.split(/\r?\n/, 1)[0] ?? '';
  if (!/^Blocked by:\s*#\d+(?:\s*,\s*#\d+)*\s*$/.test(firstLine)) {
    return [];
  }
  return Array.from(firstLine.matchAll(/#(\d+)/g), (match) => Number.parseInt(match[1] ?? '', 10));
}

async function fallbackBlockersAreClosed(
  execute: GitHubExecutor,
  repository: string,
  snapshot: unknown,
): Promise<boolean> {
  for (const blockerNumber of fallbackBlockerNumbers(snapshot)) {
    const blocker = await execute([
      'issue',
      'view',
      String(blockerNumber),
      '--repo',
      repository,
      '--json',
      'state',
      '--jq',
      '.state',
    ]);
    if (blocker.exitCode !== 0 || blocker.stdout.trim().toUpperCase() === 'OPEN') {
      return false;
    }
  }
  return true;
}

async function blockersAreClear(
  execute: GitHubExecutor,
  repository: string,
  issueNumber: number,
  snapshot: unknown,
): Promise<boolean> {
  const nativeResult = await execute(nativeBlockerArgs(repository, issueNumber));
  const count = nativeBlockerCount(nativeResult);
  if (count === undefined || count > 0) {
    return false;
  }
  return fallbackBlockersAreClosed(execute, repository, snapshot);
}

async function snapshotIsClaimable(
  execute: GitHubExecutor,
  repository: string,
  selection: RoutedIssue,
  expectedAssignees: readonly string[],
): Promise<boolean> {
  const snapshotResult = await execute(issueViewArgs(repository, selection.issue.number));
  const snapshot = decodeJson(GITHUB_ISSUE_SCHEMA, snapshotResult.stdout);
  if (
    snapshotResult.exitCode !== 0 ||
    !isIssueClaimable(snapshot, selection.route, expectedAssignees)
  ) {
    return false;
  }
  return blockersAreClear(execute, repository, selection.issue.number, snapshot);
}

/** Create the production adapter that invokes the GitHub CLI without a shell. */
export function createGitHubExecutor(): GitHubExecutor {
  return async (args) =>
    new Promise((resolve, reject) => {
      const child = spawn('gh', [...args], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
      });
      child.on('error', reject);
      child.on('close', (exitCode) => {
        resolve({ exitCode: exitCode ?? 1, stderr, stdout });
      });
    });
}

/** Discover the next coarse-route candidate from GitHub search results. */
export async function discoverNextIssue(
  execute: GitHubExecutor,
  repository: string,
  excludedIssueNumbers: ReadonlySet<number> = new Set(),
): Promise<RoutedIssue | undefined> {
  const searches = [
    `${BASE_SEARCH} label:wayfinder:research`,
    ...Array.from(
      IMPLEMENTATION_LABELS,
      (label) => `${BASE_SEARCH} label:${label} -label:wayfinder:research`,
    ),
  ];
  const merged: unknown[] = [];
  for (const search of searches) {
    const result = await execute([
      'issue',
      'list',
      '--repo',
      repository,
      '--search',
      search,
      '--state',
      'open',
      '--limit',
      '100',
      '--json',
      ISSUE_FIELDS,
    ]);
    const payload = decodeJson(GITHUB_ISSUE_LIST_SCHEMA, result.stdout);
    if (result.exitCode !== 0 || payload === undefined) {
      throw new Error(`GitHub discovery failed: ${result.stderr.trim()}`);
    }
    merged.push(...payload);
  }
  return selectNextEligibleIssue(
    merged.filter((value) => {
      const issue = decodeValue(GITHUB_ISSUE_SCHEMA, value);
      return issue === undefined || !excludedIssueNumbers.has(issue.number);
    }),
  );
}

async function releaseClaim(
  execute: GitHubExecutor,
  repository: string,
  issueNumber: number,
): Promise<void> {
  const result = await execute([
    'issue',
    'edit',
    String(issueNumber),
    '--repo',
    repository,
    '--remove-assignee',
    '@me',
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`GitHub unassign failed: ${result.stderr.trim()}`);
  }
}

/** Atomically claim an eligible issue and verify ownership after assignment. */
export async function claimIssue(
  execute: GitHubExecutor,
  repository: string,
  selection: RoutedIssue,
): Promise<boolean> {
  const identity = await execute(['api', 'user', '--jq', '.login']);
  const login = identity.stdout.trim();
  if (identity.exitCode !== 0 || login.length === 0) {
    return false;
  }
  if (!(await snapshotIsClaimable(execute, repository, selection, []))) {
    return false;
  }

  const assignment = await execute([
    'issue',
    'edit',
    String(selection.issue.number),
    '--repo',
    repository,
    '--add-assignee',
    '@me',
  ]);
  if (assignment.exitCode !== 0) {
    return false;
  }

  try {
    const claimed = await snapshotIsClaimable(execute, repository, selection, [login]);
    if (!claimed) {
      await releaseClaim(execute, repository, selection.issue.number);
    }
    return claimed;
  } catch (error) {
    await releaseClaim(execute, repository, selection.issue.number);
    throw error;
  }
}

/** Add a progress or outcome comment to an issue. */
export async function commentOnIssue(
  execute: GitHubExecutor,
  repository: string,
  issueNumber: number,
  body: string,
): Promise<void> {
  const result = await execute([
    'issue',
    'comment',
    String(issueNumber),
    '--repo',
    repository,
    '--body',
    body,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`GitHub comment failed: ${result.stderr.trim()}`);
  }
}

/** Close a successfully completed issue. */
export async function closeIssue(
  execute: GitHubExecutor,
  repository: string,
  issueNumber: number,
): Promise<void> {
  const result = await execute(['issue', 'close', String(issueNumber), '--repo', repository]);
  if (result.exitCode !== 0) {
    throw new Error(`GitHub close failed: ${result.stderr.trim()}`);
  }
}

/** Escalate a terminal AFK failure and release the current claim. */
export async function escalateIssue(
  execute: GitHubExecutor,
  repository: string,
  issueNumber: number,
  reason: string,
): Promise<void> {
  await commentOnIssue(execute, repository, issueNumber, reason);
  const result = await execute([
    'issue',
    'edit',
    String(issueNumber),
    '--repo',
    repository,
    '--remove-label',
    'ready-for-agent',
    '--add-label',
    'ready-for-human',
    '--remove-assignee',
    '@me',
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`GitHub escalation failed: ${result.stderr.trim()}`);
  }
}

/** Create or reuse the pull request for a pushed issue branch. */
export async function ensurePullRequest(
  execute: GitHubExecutor,
  repository: string,
  branch: string,
  baseBranch: string,
  title: string,
  body: string,
): Promise<string> {
  const existing = await execute([
    'pr',
    'view',
    branch,
    '--repo',
    repository,
    '--json',
    'url',
    '--jq',
    '.url',
  ]);
  if (existing.exitCode === 0 && existing.stdout.trim().length > 0) {
    return existing.stdout.trim();
  }
  const created = await execute([
    'pr',
    'create',
    '--repo',
    repository,
    '--head',
    branch,
    '--base',
    baseBranch,
    '--title',
    title,
    '--body',
    body,
  ]);
  if (created.exitCode !== 0 || created.stdout.trim().length === 0) {
    throw new Error(`Pull request creation failed: ${created.stderr.trim()}`);
  }
  return created.stdout.trim();
}

/** Release a claim after either successful closure or a skipped issue. */
export async function unassignIssue(
  execute: GitHubExecutor,
  repository: string,
  issueNumber: number,
): Promise<void> {
  await releaseClaim(execute, repository, issueNumber);
}
