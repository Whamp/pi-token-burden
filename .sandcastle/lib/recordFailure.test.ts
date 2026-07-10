import { chmod, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { recordFailure } from './recordFailure.js';

describe('recordFailure()', () => {
  it('retains the raw reason on the host and returns only a safe public summary', async () => {
    const logsDirectory = await mkdtemp(join(tmpdir(), 'sandcastle-failure-log-'));
    const reason = 'GitHub setup failed: GH_TOKEN=ghp_reason_secret';
    await chmod(logsDirectory, 0o755);

    try {
      const recorded = await recordFailure({ issueNumber: 42, logsDirectory, reason });

      expect(recorded.safeReason).toMatch(
        /^Sandcastle workflow failed \(failure ID: [a-f0-9]{12}\)\./u,
      );
      expect(recorded.safeReason).not.toContain('ghp_reason_secret');
      const logPath = join(logsDirectory, recorded.logName);
      await expect(readFile(logPath, 'utf8')).resolves.toBe(`${reason}\n`);
      expect((await stat(logsDirectory)).mode & 0o777).toBe(0o700);
      expect((await stat(logPath)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(logsDirectory, { force: true, recursive: true });
    }
  });
});
