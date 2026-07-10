import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

import type { AgentProvider, Sandbox, SandboxRunResult } from '@ai-hero/sandcastle';

import {
  decodeJson,
  IMPLEMENTATION_RESULT_SCHEMA,
  RESEARCH_RESULT_SCHEMA,
  REVIEW_RESULT_SCHEMA,
} from './schema.js';
import { secureLogStore } from './secureLogStore.js';
import type { IssueContext, ResearchResult, ReviewResult, ValidationResult } from './types.js';

const MAX_PASSES = 3;

function taggedText(stdout: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'u').exec(stdout);
  return match === null ? undefined : match[1];
}

function implementationOutputIsValid(stdout: string, expectedAttempt: number): boolean {
  const text = taggedText(stdout, 'implementationResult');
  const output = text === undefined ? undefined : decodeJson(IMPLEMENTATION_RESULT_SCHEMA, text);
  return output !== undefined && output.attempt === expectedAttempt;
}

/** Parse and validate one reviewer result block. */
export function parseReviewResult(
  stdout: string,
  tag: 'reviewSpec' | 'reviewStandards',
): ReviewResult | undefined {
  const text = taggedText(stdout, tag);
  const result = text === undefined ? undefined : decodeJson(REVIEW_RESULT_SCHEMA, text);
  const expectedAxis = tag === 'reviewSpec' ? 'spec' : 'standards';
  if (result?.axis !== expectedAxis) {
    return undefined;
  }
  const coherentPass =
    result.verdict === 'pass' && !result.blocking && result.findings.length === 0;
  const coherentFailure =
    result.verdict === 'fail' && result.blocking && result.findings.length > 0;
  return coherentPass || coherentFailure ? result : undefined;
}

/** Parse and validate the research route result block. */
export function parseResearchResult(stdout: string): ResearchResult | undefined {
  const text = taggedText(stdout, 'researchResult');
  return text === undefined ? undefined : decodeJson(RESEARCH_RESULT_SCHEMA, text);
}

async function renderPrompt(
  promptName: string,
  values: Readonly<Record<string, string>>,
): Promise<string> {
  const path = resolve('.sandcastle', 'prompts', promptName);
  const template = await readFile(path, 'utf8');
  return template.replace(/\{\{([A-Z_]+)\}\}/gu, (_, key: string) => {
    const value = values[key];
    if (value === undefined) {
      throw new Error(`Missing prompt value: ${key}`);
    }
    return value;
  });
}

function requireResume(result: SandboxRunResult): NonNullable<SandboxRunResult['resume']> {
  if (result.resume === undefined) {
    throw new Error('Pi session capture did not provide resume()');
  }
  return result.resume;
}

function requireFork(result: SandboxRunResult): NonNullable<SandboxRunResult['fork']> {
  if (result.fork === undefined) {
    throw new Error('Pi session capture did not provide fork()');
  }
  return result.fork;
}

async function repairImplementationOutput(
  result: SandboxRunResult,
  expectedAttempt: number,
): Promise<SandboxRunResult> {
  if (implementationOutputIsValid(result.stdout, expectedAttempt)) {
    return result;
  }
  const repaired = await requireResume(result)(
    `Do not edit files. Return only the required <implementationResult> JSON block for attempt ${expectedAttempt}, accurately summarizing the work already committed.`,
    { name: `implementation-output-${expectedAttempt}` },
  );
  if (!implementationOutputIsValid(repaired.stdout, expectedAttempt)) {
    throw new Error(`Implementation output contract was invalid for attempt ${expectedAttempt}`);
  }
  return repaired;
}

async function repairReviewOutput(
  result: SandboxRunResult,
  tag: 'reviewSpec' | 'reviewStandards',
): Promise<ReviewResult> {
  const parsed = parseReviewResult(result.stdout, tag);
  if (parsed !== undefined) {
    return parsed;
  }
  const repaired = await requireResume(result)(
    `Do not edit files. Return only the required <${tag}> JSON block with your actual review verdict and findings.`,
    { name: `${tag}-output-repair` },
  );
  const repairedResult = parseReviewResult(repaired.stdout, tag);
  if (repairedResult === undefined) {
    throw new Error(`${tag} output contract was invalid after one repair`);
  }
  return repairedResult;
}

function safeValidationReport(validation: ValidationResult): object {
  const summarize = (result: ValidationResult['check']) => ({
    outputBytes: Buffer.byteLength(result.output),
    outputSha256: createHash('sha256').update(result.output).digest('hex'),
    passed: result.passed,
  });
  return {
    check: summarize(validation.check),
    testE2E: summarize(validation.testE2E),
  };
}

interface PassSnapshot {
  readonly pass: number;
  readonly spec: ReviewResult;
  readonly standards: ReviewResult;
  readonly validation: ValidationResult;
}

async function persistPassReports(
  sandbox: Sandbox,
  issueNumber: number,
  snapshots: readonly PassSnapshot[],
  logsDirectory: string,
): Promise<string> {
  const issueRelative = `.sandcastle/reports/issue-${issueNumber}`;
  const issueDirectory = join(sandbox.worktreePath, issueRelative);
  await rm(issueDirectory, { force: true, recursive: true });
  await mkdir(issueDirectory, { recursive: true });
  const logs = secureLogStore(logsDirectory);
  await logs.harden();
  await Promise.all(
    snapshots.flatMap(({ pass, spec, standards, validation }) => {
      const directory = join(issueDirectory, `pass-${pass}`);
      return [
        mkdir(directory, { recursive: true }).then(() =>
          writeFile(
            join(directory, 'review-standards.json'),
            `${JSON.stringify(standards, undefined, 2)}\n`,
          ),
        ),
        mkdir(directory, { recursive: true }).then(() =>
          writeFile(join(directory, 'review-spec.json'), `${JSON.stringify(spec, undefined, 2)}\n`),
        ),
        mkdir(directory, { recursive: true }).then(() =>
          writeFile(
            join(directory, 'validation.json'),
            `${JSON.stringify(safeValidationReport(validation), undefined, 2)}\n`,
          ),
        ),
        logs.write(
          `sandcastle-issue-${issueNumber}-pass-${pass}-check.log`,
          validation.check.output,
        ),
        logs.write(
          `sandcastle-issue-${issueNumber}-pass-${pass}-test-e2e.log`,
          validation.testE2E.output,
        ),
      ];
    }),
  );
  const latest = snapshots.at(-1);
  if (latest === undefined) {
    throw new Error('At least one pass report is required');
  }
  return `${issueRelative}/pass-${latest.pass}`;
}

async function validateImplementation(sandbox: Sandbox): Promise<ValidationResult> {
  const check = await sandbox.exec('pnpm run check');
  const testE2E = await sandbox.exec('pnpm run test:e2e');
  return {
    check: {
      output: `${check.stdout}${check.stderr}`,
      passed: check.exitCode === 0,
    },
    testE2E: {
      output: `${testE2E.stdout}${testE2E.stderr}`,
      passed: testE2E.exitCode === 0,
    },
  };
}

function findingsText(
  standards: ReviewResult,
  spec: ReviewResult,
  validation: ValidationResult,
  issueNumber: number,
  pass: number,
): string {
  const severityOrder = { high: 0, low: 2, medium: 1 };
  const findings = [...standards.findings, ...spec.findings]
    .sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity])
    .map(
      (finding) =>
        `- ${finding.severity}: ${finding.file}:${finding.line} ${finding.issue}; required fix: ${finding.requiredFix}`,
    );
  if (!validation.check.passed) {
    findings.push(
      `- validation: pnpm run check failed; inspect .sandcastle/logs/sandcastle-issue-${issueNumber}-pass-${pass}-check.log`,
    );
  }
  if (!validation.testE2E.passed) {
    findings.push(
      `- validation: pnpm run test:e2e failed; inspect .sandcastle/logs/sandcastle-issue-${issueNumber}-pass-${pass}-test-e2e.log`,
    );
  }
  return findings.join('\n') || 'No findings.';
}

function quoteShellArgument(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

async function researchArtifactIsValid(
  worktreePath: string,
  artifactPath: string,
): Promise<boolean> {
  const researchRoot = resolve(worktreePath, 'docs', 'research');
  const candidate = resolve(worktreePath, artifactPath);
  if (!candidate.startsWith(`${researchRoot}${sep}`) || !candidate.endsWith('.md')) {
    return false;
  }
  try {
    return (await lstat(candidate)).isFile();
  } catch {
    return false;
  }
}

/** Execute a research ticket and verify its cited Markdown artifact exists. */
export async function runResearch(
  sandbox: Sandbox,
  agent: AgentProvider,
  issue: IssueContext,
): Promise<ResearchResult> {
  const result = await sandbox.run({
    agent,
    name: 'research',
    promptArgs: {
      BLOCKER_SUMMARY: 'Native and fallback blockers revalidated: none open.',
      ISSUE_BODY: issue.body,
      ISSUE_LABELS: issue.labels.join(', '),
      ISSUE_NUMBER: String(issue.number),
      ISSUE_TITLE: issue.title,
      LINKED_REFERENCES: issue.body.match(/#\d+/gu)?.join(', ') ?? '(none)',
      PREVIOUS_ASSETS: 'Search docs/research and docs/plans for related assets.',
    },
    promptFile: '.sandcastle/prompts/research.md',
  });
  let research = parseResearchResult(result.stdout);
  if (research === undefined) {
    const repaired = await requireResume(result)(
      'Do not edit files. Return only the required <researchResult> JSON block, accurately summarizing the cited artifact already committed.',
      { name: 'research-output-repair' },
    );
    research = parseResearchResult(repaired.stdout);
  }
  if (
    research === undefined ||
    research.evidence.length === 0 ||
    !(await researchArtifactIsValid(sandbox.worktreePath, research.artifactPath))
  ) {
    throw new Error('Research result or cited artifact contract was invalid');
  }
  const committedEntry = await sandbox.exec(
    `git ls-tree -z HEAD -- ${quoteShellArgument(research.artifactPath)}`,
  );
  const metadataEnd = committedEntry.stdout.indexOf('\t');
  const metadata =
    metadataEnd > 0 && committedEntry.stdout.endsWith('\0')
      ? committedEntry.stdout.slice(0, metadataEnd)
      : '';
  const committed = /^(?:100644|100755) blob ([a-f0-9]{40})$/u.exec(metadata);
  if (committedEntry.exitCode !== 0 || committed === null) {
    throw new Error('Research artifact is not committed at branch HEAD');
  }
  const worktreeBlob = await sandbox.exec(
    `git hash-object --path=${quoteShellArgument(research.artifactPath)} -- ${quoteShellArgument(research.artifactPath)}`,
  );
  if (worktreeBlob.exitCode !== 0 || worktreeBlob.stdout.trim() !== committed[1]) {
    throw new Error('Research artifact is not committed at branch HEAD');
  }
  return research;
}

/** Execute implementation, parallel review, fix, and validation passes. */
export async function runImplementation(
  sandbox: Sandbox,
  agent: AgentProvider,
  issue: IssueContext,
  baseBranch: string,
  onStage: (message: string) => Promise<void>,
  logsDirectory: string,
): Promise<{ readonly reportsPath: string; readonly summary: string }> {
  let work = await sandbox.run({
    agent,
    name: 'implement',
    promptArgs: {
      BASE_BRANCH: baseBranch,
      BRANCH: sandbox.branch,
      ISSUE_BODY: issue.body,
      ISSUE_NUMBER: String(issue.number),
      ISSUE_TITLE: issue.title,
      PRIOR_OUTPUT: '(none; initial implementation pass)',
      ROUTE_VALIDATION:
        'Issue is OPEN, ready-for-agent, unassigned before claim, route labels match, and no blockers are open.',
    },
    promptFile: '.sandcastle/prompts/implement.md',
  });

  work = await repairImplementationOutput(work, 1);

  let latestReportsPath = '';
  const passSnapshots: PassSnapshot[] = [];
  for (let pass = 1; pass <= MAX_PASSES; pass += 1) {
    await onStage(`Implementation pass ${pass} completed; starting parallel review.`);
    const sharedValues = {
      BASE_BRANCH: baseBranch,
      BRANCH: sandbox.branch,
      ISSUE_BODY: issue.body,
      ISSUE_NUMBER: String(issue.number),
      ISSUE_TITLE: issue.title,
    };
    const [standardsPrompt, specPrompt] = await Promise.all([
      renderPrompt('review-standards.md', sharedValues),
      renderPrompt('review-spec.md', sharedValues),
    ]);
    const fork = requireFork(work);
    const [standardsTurn, specTurn] = await Promise.all([
      fork(standardsPrompt, { name: 'review-standards' }),
      fork(specPrompt, { name: 'review-spec' }),
    ]);
    const [standards, spec] = await Promise.all([
      repairReviewOutput(standardsTurn, 'reviewStandards'),
      repairReviewOutput(specTurn, 'reviewSpec'),
    ]);

    const validation = await validateImplementation(sandbox);
    passSnapshots.push({ pass, spec, standards, validation });
    latestReportsPath = await persistPassReports(
      sandbox,
      issue.number,
      passSnapshots,
      logsDirectory,
    );
    await onStage(
      `Pass ${pass}: standards=${standards.verdict}, spec=${spec.verdict}, check=${validation.check.passed}, e2e=${validation.testE2E.passed}. Reports: ${latestReportsPath}`,
    );
    if (
      standards.verdict === 'pass' &&
      spec.verdict === 'pass' &&
      validation.check.passed &&
      validation.testE2E.passed
    ) {
      return {
        reportsPath: latestReportsPath,
        summary: `Implementation completed in ${pass} pass(es).`,
      };
    }
    if (pass === MAX_PASSES) {
      break;
    }

    const fixPrompt = await renderPrompt('fix.md', {
      ATTEMPT: String(pass + 1),
      BASE_BRANCH: baseBranch,
      BRANCH: sandbox.branch,
      FINDINGS: findingsText(standards, spec, validation, issue.number, pass),
      ISSUE_NUMBER: String(issue.number),
    });
    work = await requireResume(work)(fixPrompt, {
      name: `fix-pass-${pass + 1}`,
    });
    work = await repairImplementationOutput(work, pass + 1);
  }
  throw new Error(`Implementation failed after ${MAX_PASSES} passes`);
}
