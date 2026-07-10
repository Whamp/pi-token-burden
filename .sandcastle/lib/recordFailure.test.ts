import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { recordFailure } from './recordFailure.js';

describe('recordFailure()', () => {
  it('retains the raw reason on the host and returns only a safe public summary', async () => {
    const logsDirectory = await mkdtemp(join(tmpdir(), 'sandcastle-failure-log-'));
    const reason = 'GitHub setup failed: GH_TOKEN=ghp_reason_secret';

    try {
      const recorded = await recordFailure({ issueNumber: 42, logsDirectory, reason });

      expect(recorded.safeReason).toMatch(
        /^Sandcastle workflow failed \(failure ID: [a-f0-9]{12}\)\./u,
      );
      expect(recorded.safeReason).not.toContain('ghp_reason_secret');
      await expect(readFile(join(logsDirectory, recorded.logName), 'utf8')).resolves.toBe(
        `${reason}\n`,
      );
    } finally {
      await rm(logsDirectory, { force: true, recursive: true });
    }
  });
});
