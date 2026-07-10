import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { preserveFailureEvidence } from './preserveFailureEvidence.js';

describe('preserveFailureEvidence()', () => {
  it('copies branch-scoped agent logs into the terminal failure report', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sandcastle-failure-'));
    const logsDirectory = join(root, 'logs');
    const worktreePath = join(root, 'worktree');
    await Promise.all([
      mkdir(logsDirectory, { recursive: true }),
      mkdir(worktreePath, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(join(logsDirectory, 'sandcastle-issue-42-implement.log'), 'agent output\n'),
      writeFile(join(logsDirectory, 'sandcastle-issue-99-implement.log'), 'unrelated\n'),
    ]);

    try {
      const relativePath = await preserveFailureEvidence({
        issueNumber: 42,
        logsDirectory,
        reason: 'Reviewer output contract failed',
        worktreePath,
      });

      expect(relativePath).toBe('.sandcastle/reports/issue-42/failure.md');
      await expect(readFile(join(worktreePath, relativePath), 'utf8')).resolves.toContain(
        'Reviewer output contract failed',
      );
      await expect(
        readFile(
          join(
            worktreePath,
            '.sandcastle/reports/issue-42/repro/sandcastle-issue-42-implement.log',
          ),
          'utf8',
        ),
      ).resolves.toBe('agent output\n');
      await expect(
        readFile(
          join(
            worktreePath,
            '.sandcastle/reports/issue-42/repro/sandcastle-issue-99-implement.log',
          ),
          'utf8',
        ),
      ).rejects.toThrow();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
