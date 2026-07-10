import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AgentProvider, Sandbox, SandboxRunResult } from '@ai-hero/sandcastle';
import { fromPartial } from '@total-typescript/shoehorn';

import type { IssueContext } from './types.js';
import {
  runImplementation,
  runResearch,
  parseResearchResult,
  parseReviewResult,
} from './workflow.js';

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

function researchOutput(artifactPath: string): string {
  return `<researchResult>${JSON.stringify({
    artifactPath,
    automationGaps: [],
    axis: 'research',
    decisions: ['Use Docker'],
    evidence: [{ claim: 'The API supports Docker', source: 'https://example.com' }],
    openQuestions: [],
    summary: 'Runtime contract',
  })}</researchResult>`;
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
          stdout: 'GH_TOKEN=ghp_validator_secret\n',
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

      expect(failingFork).toHaveBeenCalledWith(expect.any(String), {
        name: 'review-standards',
      });
      expect(failingFork).toHaveBeenCalledWith(expect.any(String), {
        name: 'review-spec',
      });
      expect(resume).toHaveBeenCalledWith(expect.stringMatching(/- high:[\s\S]*- low:/u), {
        name: 'fix-pass-2',
      });
      const validationReport = await readFile(
        join(worktreePath, '.sandcastle', 'reports', 'issue-42', 'pass-2', 'validation.json'),
        'utf8',
      );
      expect(validationReport).not.toContain('ghp_validator_secret');
      expect(validationReport).toContain('outputBytes');
      expect(validationReport).toContain('outputSha256');
      await expect(
        readFile(
          join(worktreePath, '.sandcastle', 'reports', 'issue-42', 'pass-2', 'check.log'),
          'utf8',
        ),
      ).rejects.toThrow();
      await expect(
        readFile(
          join(worktreePath, '.sandcastle', 'logs', 'sandcastle-issue-42-pass-2-check.log'),
          'utf8',
        ),
      ).resolves.toContain('ghp_validator_secret');
    } finally {
      await rm(worktreePath, { force: true, recursive: true });
    }
  });

  it('repairs a missing implementation result with valid inline resume options', async () => {
    const worktreePath = await mkdtemp(join(tmpdir(), 'sandcastle-repair-'));
    const standardsPass =
      '<reviewStandards>{"axis":"standards","verdict":"pass","blocking":false,"findings":[]}</reviewStandards>';
    const specPass =
      '<reviewSpec>{"axis":"spec","verdict":"pass","blocking":false,"findings":[]}</reviewSpec>';
    const passingFork = vi
      .fn<NonNullable<SandboxRunResult['fork']>>()
      .mockImplementation(async (prompt) =>
        fromPartial<SandboxRunResult>({
          stdout: prompt.includes('<reviewStandards>') ? standardsPass : specPass,
        }),
      );
    const repairedWork = fromPartial<SandboxRunResult>({
      fork: passingFork,
      stdout: implementationOutput(1),
    });
    const resume = vi.fn<NonNullable<SandboxRunResult['resume']>>().mockResolvedValue(repairedWork);
    const initialWork = fromPartial<SandboxRunResult>({
      resume,
      stdout: 'Committed the requested work without returning the result block.',
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
      run: vi.fn<Sandbox['run']>().mockResolvedValue(initialWork),
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

      expect(resume).toHaveBeenCalledWith(expect.stringContaining('<implementationResult>'), {
        name: 'implementation-output-1',
      });
    } finally {
      await rm(worktreePath, { force: true, recursive: true });
    }
  });
});

describe('runResearch()', () => {
  it('rejects a cited artifact that escapes docs/research', async () => {
    const worktreePath = await mkdtemp(join(tmpdir(), 'sandcastle-research-'));
    await writeFile(join(worktreePath, 'outside.md'), '# Outside');
    const stdout = researchOutput('docs/research/../../outside.md');
    const sandbox = fromPartial<Sandbox>({
      run: vi.fn().mockResolvedValue(fromPartial<SandboxRunResult>({ stdout })),
      worktreePath,
    });

    try {
      await expect(runResearch(sandbox, fromPartial<AgentProvider>({}), ISSUE)).rejects.toThrow(
        'Research result or cited artifact contract was invalid',
      );
    } finally {
      await rm(worktreePath, { force: true, recursive: true });
    }
  });

  it('rejects an artifact that is not a committed blob at HEAD', async () => {
    const worktreePath = await mkdtemp(join(tmpdir(), 'sandcastle-research-'));
    const artifactPath = 'docs/research/runtime.md';
    await mkdir(join(worktreePath, 'docs', 'research'), { recursive: true });
    await writeFile(join(worktreePath, artifactPath), '# Runtime');
    const stdout = researchOutput(artifactPath);
    const sandbox = fromPartial<Sandbox>({
      exec: vi.fn().mockResolvedValue({ exitCode: 1, stderr: 'not found', stdout: '' }),
      run: vi.fn().mockResolvedValue(fromPartial<SandboxRunResult>({ stdout })),
      worktreePath,
    });

    try {
      await expect(runResearch(sandbox, fromPartial<AgentProvider>({}), ISSUE)).rejects.toThrow(
        'Research artifact is not committed at branch HEAD',
      );
    } finally {
      await rm(worktreePath, { force: true, recursive: true });
    }
  });

  it('rejects a worktree artifact whose content differs from HEAD', async () => {
    const worktreePath = await mkdtemp(join(tmpdir(), 'sandcastle-research-'));
    const artifactPath = 'docs/research/modified.md';
    await mkdir(join(worktreePath, 'docs', 'research'), { recursive: true });
    await writeFile(join(worktreePath, artifactPath), '# Modified after commit');
    const exec = vi.fn<Sandbox['exec']>().mockImplementation(async (command) => {
      if (command.startsWith('git ls-tree ')) {
        return {
          exitCode: 0,
          stderr: '',
          stdout: `100644 blob ${'a'.repeat(40)}\t${artifactPath}\0`,
        };
      }
      if (command.startsWith('git hash-object ')) {
        return { exitCode: 0, stderr: '', stdout: `${'b'.repeat(40)}\n` };
      }
      return { exitCode: 0, stderr: '', stdout: '' };
    });
    const sandbox = fromPartial<Sandbox>({
      exec,
      run: vi
        .fn()
        .mockResolvedValue(fromPartial<SandboxRunResult>({ stdout: researchOutput(artifactPath) })),
      worktreePath,
    });

    try {
      await expect(runResearch(sandbox, fromPartial<AgentProvider>({}), ISSUE)).rejects.toThrow(
        'Research artifact is not committed at branch HEAD',
      );
    } finally {
      await rm(worktreePath, { force: true, recursive: true });
    }
  });

  it('accepts a regular Markdown artifact committed as a blob', async () => {
    const worktreePath = await mkdtemp(join(tmpdir(), 'sandcastle-research-'));
    const artifactPath = "docs/research/will's-runtime.md";
    await mkdir(join(worktreePath, 'docs', 'research'), { recursive: true });
    await writeFile(join(worktreePath, artifactPath), '# Runtime');
    const oid = 'a'.repeat(40);
    const exec = vi
      .fn<Sandbox['exec']>()
      .mockImplementation(async (command) =>
        command.startsWith('git ls-tree ')
          ? { exitCode: 0, stderr: '', stdout: `100644 blob ${oid}\t${artifactPath}\0` }
          : { exitCode: 0, stderr: '', stdout: `${oid}\n` },
      );
    const sandbox = fromPartial<Sandbox>({
      exec,
      run: vi
        .fn()
        .mockResolvedValue(fromPartial<SandboxRunResult>({ stdout: researchOutput(artifactPath) })),
      worktreePath,
    });

    try {
      await expect(
        runResearch(sandbox, fromPartial<AgentProvider>({}), ISSUE),
      ).resolves.toMatchObject({ artifactPath });
      expect(exec).toHaveBeenCalledWith(
        `git ls-tree -z HEAD -- 'docs/research/will'"'"'s-runtime.md'`,
      );
      expect(exec).toHaveBeenCalledWith(
        `git hash-object --path='docs/research/will'"'"'s-runtime.md' -- 'docs/research/will'"'"'s-runtime.md'`,
      );
    } finally {
      await rm(worktreePath, { force: true, recursive: true });
    }
  });

  it('rejects a committed symlink whose name ends in .md', async () => {
    const worktreePath = await mkdtemp(join(tmpdir(), 'sandcastle-research-'));
    const artifactPath = 'docs/research/linked.md';
    await mkdir(join(worktreePath, 'docs', 'research'), { recursive: true });
    await writeFile(join(worktreePath, 'outside.md'), '# Outside');
    await symlink('../../outside.md', join(worktreePath, artifactPath));
    const sandbox = fromPartial<Sandbox>({
      exec: vi.fn<Sandbox['exec']>().mockResolvedValue({
        exitCode: 0,
        stderr: '',
        stdout: 'blob\n',
      }),
      run: vi
        .fn()
        .mockResolvedValue(fromPartial<SandboxRunResult>({ stdout: researchOutput(artifactPath) })),
      worktreePath,
    });

    try {
      await expect(runResearch(sandbox, fromPartial<AgentProvider>({}), ISSUE)).rejects.toThrow(
        'Research result or cited artifact contract was invalid',
      );
    } finally {
      await rm(worktreePath, { force: true, recursive: true });
    }
  });

  it('rejects a directory whose name ends in .md', async () => {
    const worktreePath = await mkdtemp(join(tmpdir(), 'sandcastle-research-'));
    const artifactPath = 'docs/research/not-a-file.md';
    await mkdir(join(worktreePath, artifactPath), { recursive: true });
    const exec = vi.fn<Sandbox['exec']>();
    const sandbox = fromPartial<Sandbox>({
      exec,
      run: vi
        .fn()
        .mockResolvedValue(fromPartial<SandboxRunResult>({ stdout: researchOutput(artifactPath) })),
      worktreePath,
    });

    try {
      await expect(runResearch(sandbox, fromPartial<AgentProvider>({}), ISSUE)).rejects.toThrow(
        'Research result or cited artifact contract was invalid',
      );
      expect(exec).not.toHaveBeenCalled();
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
    const contradictoryPass =
      '<reviewSpec>{"axis":"spec","verdict":"pass","blocking":true,"findings":[{"severity":"high","file":"src/a.ts","line":7,"issue":"Still blocked","requiredFix":"Implement it"}]}</reviewSpec>';
    const contradictoryFail =
      '<reviewSpec>{"axis":"spec","verdict":"fail","blocking":false,"findings":[]}</reviewSpec>';
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
    expect(parseReviewResult(contradictoryPass, 'reviewSpec')).toBeUndefined();
    expect(parseReviewResult(contradictoryFail, 'reviewSpec')).toBeUndefined();
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
