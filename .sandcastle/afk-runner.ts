import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { pathToFileURL } from 'node:url';

import { createSandbox, pi, type PiOptions, type Sandbox } from '@ai-hero/sandcastle';
import { docker } from '@ai-hero/sandcastle/sandboxes/docker';

import { IssueRoute } from './lib/enums.js';
import {
  claimIssue,
  closeIssue,
  commentOnIssue,
  createGitHubExecutor,
  discoverNextIssue,
  ensurePullRequest,
  escalateIssue,
  unassignIssue,
} from './lib/github.js';
import { logError, logInfo } from './lib/logger.js';
import { preserveFailureEvidence } from './lib/preserveFailureEvidence.js';
import { recordFailure } from './lib/recordFailure.js';
import type { GitHubExecutor, RoutedIssue } from './lib/types.js';
import { runImplementation, runResearch } from './lib/workflow.js';

const BASE_BRANCH = 'main';
const DEFAULT_IMAGE = 'pi-token-burden-sandcastle:local';
const DEFAULT_MODEL = 'zai/glm-5.2';
const DEFAULT_REPOSITORY = 'Whamp/pi-token-burden';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function recordIssueFailure(issueNumber: number, reason: string) {
  try {
    return await recordFailure({
      issueNumber,
      logsDirectory: resolve('.sandcastle', 'logs'),
      reason,
    });
  } catch (error) {
    logError('Failed to retain raw Sandcastle failure reason', {
      error: errorMessage(error),
      issueNumber,
    });
    return {
      failureId: 'unavailable',
      safeReason:
        'Sandcastle workflow failed. Raw failure retention also failed; inspect runner stderr.',
    };
  }
}

function loadRunnerEnvironment(): void {
  const path = resolve('.sandcastle', '.env');
  if (existsSync(path)) {
    loadEnvFile(path);
  }
}

function thinkingLevel(): PiOptions['thinking'] {
  const configured = process.env.SANDCASTLE_PI_THINKING ?? 'xhigh';
  switch (configured) {
    case 'high':
    case 'low':
    case 'medium':
    case 'minimal':
    case 'off':
    case 'xhigh':
      return configured;
    default:
      throw new Error(`Unsupported SANDCASTLE_PI_THINKING: ${configured}`);
  }
}

async function createIssueSandbox(selection: RoutedIssue, repository: string): Promise<Sandbox> {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) {
    throw new Error(`Invalid GitHub repository: ${repository}`);
  }
  const cachePath = resolve('.sandcastle', 'cache', 'pnpm-store');
  await mkdir(cachePath, { recursive: true });
  const branch = `sandcastle/issue-${selection.issue.number}`;
  const sandbox = await createSandbox({
    baseBranch: BASE_BRANCH,
    branch,
    sandbox: docker({
      imageName: process.env.SANDCASTLE_DOCKER_IMAGE ?? DEFAULT_IMAGE,
      mounts: [
        {
          hostPath: cachePath,
          sandboxPath: '/home/agent/.local/share/pnpm/store',
        },
      ],
    }),
  });
  const install = await sandbox.exec(
    'pnpm install --frozen-lockfile --store-dir /home/agent/.local/share/pnpm/store',
  );
  if (install.exitCode !== 0) {
    await sandbox.close();
    throw new Error(`Sandbox dependency setup failed: ${install.stderr}`);
  }
  const identity = await sandbox.exec(
    [
      'mkdir -p ~/.pi/agent',
      `printf '%s\\n' '{"defaultProjectTrust":"never","enableInstallTelemetry":false,"retry":{"provider":{"maxRetryDelayMs":60000}}}' > ~/.pi/agent/settings.json`,
      'git config user.name "Sandcastle AFK"',
      'git config user.email "sandcastle@local.invalid"',
      'gh auth setup-git',
      `git remote set-url origin "https://github.com/${repository}.git"`,
    ].join(' && '),
  );
  if (identity.exitCode !== 0) {
    await sandbox.close();
    throw new Error(`Sandbox git setup failed: ${identity.stderr}`);
  }
  return sandbox;
}

async function pushBranch(sandbox: Sandbox): Promise<void> {
  const push = await sandbox.exec(`git push --set-upstream origin ${sandbox.branch}`);
  if (push.exitCode !== 0) {
    throw new Error(`Branch push failed: ${push.stderr}`);
  }
}

async function commitReports(sandbox: Sandbox, issueNumber: number): Promise<void> {
  const commit = await sandbox.exec(
    `git add .sandcastle/reports/issue-${issueNumber} && git commit -m "chore: add Sandcastle reports for issue ${issueNumber}"`,
  );
  if (commit.exitCode !== 0) {
    throw new Error(`Report commit failed: ${commit.stderr}`);
  }
}

async function publishImplementation(
  execute: GitHubExecutor,
  repository: string,
  selection: RoutedIssue,
  sandbox: Sandbox,
  reportsPath: string,
  summary: string,
): Promise<void> {
  await commitReports(sandbox, selection.issue.number);
  await pushBranch(sandbox);
  const reportsUrl = `https://github.com/${repository}/tree/${sandbox.branch}/${reportsPath}`;
  const pullRequestUrl = await ensurePullRequest(
    execute,
    repository,
    sandbox.branch,
    BASE_BRANCH,
    `sandcastle: issue #${selection.issue.number} — ${selection.issue.title}`,
    [
      `## Summary\n${summary}`,
      '## Validation\n- `pnpm run check`\n- `pnpm run test:e2e`',
      `## Review and validation artifacts\n${reportsUrl}`,
      `Closes #${selection.issue.number}`,
    ].join('\n\n'),
  );
  await commentOnIssue(
    execute,
    repository,
    selection.issue.number,
    `Implementation complete: ${pullRequestUrl}\n\nArtifacts: ${reportsUrl}`,
  );
  await closeIssue(execute, repository, selection.issue.number);
}

async function publishResearch(
  execute: GitHubExecutor,
  repository: string,
  selection: RoutedIssue,
  sandbox: Sandbox,
  artifactPath: string,
  summary: string,
): Promise<void> {
  await pushBranch(sandbox);
  const artifactUrl = `https://github.com/${repository}/blob/${sandbox.branch}/${artifactPath}`;
  const pullRequestUrl = await ensurePullRequest(
    execute,
    repository,
    sandbox.branch,
    BASE_BRANCH,
    `sandcastle: issue #${selection.issue.number} — ${selection.issue.title}`,
    [
      `## Research summary\n${summary}`,
      `## Cited artifact\n${artifactUrl}`,
      '## Validation\nNot run by design for research tickets.',
      `Closes #${selection.issue.number}`,
    ].join('\n\n'),
  );
  await commentOnIssue(
    execute,
    repository,
    selection.issue.number,
    `${summary}\n\nResearch PR: ${pullRequestUrl}\nArtifact: ${artifactUrl}`,
  );
  await closeIssue(execute, repository, selection.issue.number);
}

async function preserveFailureReport(
  sandbox: Sandbox,
  repository: string,
  issueNumber: number,
  failureId: string,
): Promise<string> {
  const relative = await preserveFailureEvidence({
    failureId,
    issueNumber,
    logsDirectory: resolve('.sandcastle', 'logs'),
    worktreePath: sandbox.worktreePath,
  });
  const commit = await sandbox.exec(
    `git add .sandcastle/reports/issue-${issueNumber} && git commit -m "chore: record Sandcastle failure for issue ${issueNumber}"`,
  );
  if (commit.exitCode !== 0) {
    throw new Error(`Failure report commit failed: ${commit.stderr}`);
  }
  await pushBranch(sandbox);
  return `https://github.com/${repository}/blob/${sandbox.branch}/${relative}`;
}

async function processSelection(
  execute: GitHubExecutor,
  repository: string,
  selection: RoutedIssue,
): Promise<void> {
  const issueNumber = selection.issue.number;
  let sandbox: Sandbox | undefined;
  try {
    await commentOnIssue(
      execute,
      repository,
      issueNumber,
      `Claimed for Sandcastle AFK route: ${selection.route}.`,
    );
    sandbox = await createIssueSandbox(selection, repository);
    await commentOnIssue(
      execute,
      repository,
      issueNumber,
      `Sandbox ready on branch \`${sandbox.branch}\`.`,
    );
    const agent = pi(process.env.SANDCASTLE_PI_MODEL ?? DEFAULT_MODEL, {
      captureSessions: true,
      thinking: thinkingLevel(),
    });

    if (selection.route === IssueRoute.Research) {
      const research = await runResearch(sandbox, agent, selection.issue);
      await publishResearch(
        execute,
        repository,
        selection,
        sandbox,
        research.artifactPath,
        research.summary,
      );
    } else {
      const implementation = await runImplementation(
        sandbox,
        agent,
        selection.issue,
        BASE_BRANCH,
        (message) => commentOnIssue(execute, repository, issueNumber, message),
        resolve('.sandcastle', 'logs'),
      );
      await publishImplementation(
        execute,
        repository,
        selection,
        sandbox,
        implementation.reportsPath,
        implementation.summary,
      );
    }
    await unassignIssue(execute, repository, issueNumber);
  } catch (error) {
    const failure = await recordIssueFailure(issueNumber, errorMessage(error));
    let report = 'No branch report was available because sandbox setup did not complete.';
    if (sandbox !== undefined) {
      try {
        report = `Failure report and host-log manifest: ${await preserveFailureReport(
          sandbox,
          repository,
          issueNumber,
          failure.failureId,
        )}`;
      } catch (reportError) {
        const reportFailure = await recordIssueFailure(issueNumber, errorMessage(reportError));
        report = `Failure report publication also failed. ${reportFailure.safeReason}`;
      }
    }
    await escalateIssue(
      execute,
      repository,
      issueNumber,
      `Sandcastle AFK stopped and needs human attention.\n\n${failure.safeReason}\n\n${report}`,
    );
  } finally {
    if (sandbox !== undefined) {
      await sandbox.close();
    }
  }
}

/** Drain every currently eligible ready-for-agent issue. */
// eslint-disable-next-line @factory/filename-match-export -- Issue #24 fixes the checked-in entrypoint path as .sandcastle/afk-runner.ts.
export async function runAfk(): Promise<void> {
  loadRunnerEnvironment();
  const execute = createGitHubExecutor();
  const repository = process.env.SANDCASTLE_GITHUB_REPOSITORY ?? DEFAULT_REPOSITORY;
  const skipped = new Set<number>();

  while (true) {
    const selection = await discoverNextIssue(execute, repository, skipped);
    if (selection === undefined) {
      logInfo('Sandcastle AFK queue is empty.');
      return;
    }
    if (!(await claimIssue(execute, repository, selection))) {
      skipped.add(selection.issue.number);
      logInfo('Skipped issue after claim revalidation', {
        issueNumber: selection.issue.number,
      });
      continue;
    }
    await processSelection(execute, repository, selection);
  }
}

const entryPath = process.argv[1];
if (entryPath !== undefined && import.meta.url === pathToFileURL(entryPath).href) {
  try {
    await runAfk();
  } catch (error) {
    logError('Sandcastle AFK runner failed', {
      error: errorMessage(error),
    });
    process.exitCode = 1;
  }
}
