import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { preserveFailureEvidence } from './preserveFailureEvidence.js';

describe('preserveFailureEvidence()', () => {
  it('publishes a safe manifest while retaining raw issue logs only on the host', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sandcastle-failure-'));
    const logsDirectory = join(root, 'logs');
    const worktreePath = join(root, 'worktree');
    await Promise.all([
      mkdir(logsDirectory, { recursive: true }),
      mkdir(worktreePath, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(
        join(logsDirectory, 'sandcastle-issue-42-implement.log'),
        'agent output with GH_TOKEN=ghp_supersecret\n',
      ),
      writeFile(join(logsDirectory, 'sandcastle-issue-99-implement.log'), 'unrelated\n'),
    ]);

    try {
      const relativePath = await preserveFailureEvidence({
        issueNumber: 42,
        logsDirectory,
        failureId: 'abcdef012345',
        worktreePath,
      });

      expect(relativePath).toBe('.sandcastle/reports/issue-42/failure.md');
      const report = await readFile(join(worktreePath, relativePath), 'utf8');
      expect(report).toContain('Sandcastle workflow failed (failure ID: abcdef012345)');
      expect(report).toContain('Raw logs are retained only on the runner host');
      expect(report).toContain('.sandcastle/logs/sandcastle-issue-42-implement.log');
      expect(report).toContain('sha256');
      expect(report).not.toContain('ghp_supersecret');
      await expect(
        readFile(
          join(
            worktreePath,
            '.sandcastle/reports/issue-42/repro/sandcastle-issue-42-implement.log',
          ),
          'utf8',
        ),
      ).rejects.toThrow();
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
