import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AgentProvider, Sandbox, SandboxRunResult } from '@ai-hero/sandcastle';
import { fromPartial } from '@total-typescript/shoehorn';

import type { IssueContext } from './types.js';
import { runImplementation, parseResearchResult, parseReviewResult } from './workflow.js';

function implementationOutput(attempt: number): string {
  return `<implementationResult>${JSON.stringify({
    artifacts: [],
    attempt,
    axis: 'implement',
    filesChanged: [],
    nextAction: 'review',
    rationale: 'Implementation pass',
    riskNotes: [],
    validation: {
      check: { logPath: 'runner-owned', status: 'pass' },
      testE2E: { logPath: 'runner-owned', reasonIfSkipped: '', status: 'pass' },
    },
  })}</implementationResult>`;
}

const ISSUE: IssueContext = {
  body: 'Implement the requested behavior.',
  createdAt: '2026-07-09T12:00:00Z',
  labels: ['ready-for-agent', 'enhancement'],
  number: 42,
  title: 'Issue 42',
};

describe('runImplementation()', () => {
  it('orders merged fix findings by severity before resuming implementation', async () => {
    const worktreePath = await mkdtemp(join(tmpdir(), 'sandcastle-workflow-'));
    const standardsFail =
      '<reviewStandards>{"axis":"standards","verdict":"fail","blocking":true,"findings":[{"file":"src/low.ts","line":1,"severity":"low","issue":"Low issue","requiredFix":"Fix low"}]}</reviewStandards>';
    const specFail =
      '<reviewSpec>{"axis":"spec","verdict":"fail","blocking":true,"findings":[{"file":"src/high.ts","line":2,"severity":"high","issue":"High issue","requiredFix":"Fix high"}]}</reviewSpec>';
    const standardsPass =
      '<reviewStandards>{"axis":"standards","verdict":"pass","blocking":false,"findings":[]}</reviewStandards>';
    const specPass =
      '<reviewSpec>{"axis":"spec","verdict":"pass","blocking":false,"findings":[]}</reviewSpec>';
    const failingFork = vi
      .fn<NonNullable<SandboxRunResult['fork']>>()
      .mockImplementation(async (prompt) =>
        fromPartial<SandboxRunResult>({
          stdout: prompt.includes('<reviewStandards>') ? standardsFail : specFail,
        }),
      );
    const passingFork = vi
      .fn<NonNullable<SandboxRunResult['fork']>>()
      .mockImplementation(async (prompt) =>
        fromPartial<SandboxRunResult>({
          stdout: prompt.includes('<reviewStandards>') ? standardsPass : specPass,
        }),
      );
    const secondWork = fromPartial<SandboxRunResult>({
      fork: passingFork,
      stdout: implementationOutput(2),
    });
    const resume = vi.fn<NonNullable<SandboxRunResult['resume']>>().mockResolvedValue(secondWork);
    const firstWork = fromPartial<SandboxRunResult>({
      fork: failingFork,
      resume,
      stdout: implementationOutput(1),
    });
    const sandbox = fromPartial<Sandbox>({
      branch: 'sandcastle/issue-42',
      exec: vi.fn<Sandbox['exec']>().mockResolvedValue(
        fromPartial({
          exitCode: 0,
          stderr: '',
          stdout: '',
        }),
      ),
      run: vi.fn<Sandbox['run']>().mockResolvedValue(firstWork),
      worktreePath,
    });

    try {
      await runImplementation(
        sandbox,
        fromPartial<AgentProvider>({}),
        ISSUE,
        'main',
        vi.fn<(message: string) => Promise<void>>().mockResolvedValue(undefined),
      );

      expect(resume).toHaveBeenCalledWith(
        expect.stringMatching(/- high:[\s\S]*- low:/u),
        expect.objectContaining({ name: 'fix-pass-2' }),
      );
    } finally {
      await rm(worktreePath, { force: true, recursive: true });
    }
  });
});

describe('workflow result contracts', () => {
  it('accepts the exact review contract and rejects malformed findings', () => {
    const valid =
      '<reviewSpec>{"axis":"spec","verdict":"fail","blocking":true,"findings":[{"severity":"high","file":"src/a.ts","line":7,"issue":"Missing behavior","requiredFix":"Implement it"}]}</reviewSpec>';
    const invalid = '<reviewSpec>{"axis":"spec","verdict":"pass","findings":[]}</reviewSpec>';
    const wrongAxis = valid.replaceAll('reviewSpec', 'reviewStandards');

    expect(parseReviewResult(valid, 'reviewSpec')).toStrictEqual({
      axis: 'spec',
      blocking: true,
      findings: [
        {
          file: 'src/a.ts',
          issue: 'Missing behavior',
          line: 7,
          requiredFix: 'Implement it',
          severity: 'high',
        },
      ],
      verdict: 'fail',
    });
    expect(parseReviewResult(invalid, 'reviewSpec')).toBeUndefined();
    expect(parseReviewResult(wrongAxis, 'reviewStandards')).toBeUndefined();
  });

  it('requires a complete cited research result', () => {
    const stdout = `<researchResult>${JSON.stringify({
      artifactPath: 'docs/research/2026-07-09-issue-22-runtime.md',
      automationGaps: [],
      axis: 'research',
      decisions: ['Use Docker'],
      evidence: [{ claim: 'The API supports Docker', source: 'https://example.com' }],
      openQuestions: [],
      summary: 'Runtime contract',
    })}</researchResult>`;

    expect(parseResearchResult(stdout)).toStrictEqual({
      artifactPath: 'docs/research/2026-07-09-issue-22-runtime.md',
      automationGaps: [],
      axis: 'research',
      decisions: ['Use Docker'],
      evidence: [{ claim: 'The API supports Docker', source: 'https://example.com' }],
      openQuestions: [],
      summary: 'Runtime contract',
    });
    expect(
      parseResearchResult('<researchResult>{"axis":"research"}</researchResult>'),
    ).toBeUndefined();
  });
});
