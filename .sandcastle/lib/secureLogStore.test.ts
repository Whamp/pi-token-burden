import { lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { secureLogStore } from './secureLogStore.js';

describe('secureLogStore()', () => {
  it('hardens existing logs and replaces unsafe symlink entries with private files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sandcastle-secure-logs-'));
    const logsDirectory = join(root, 'logs');
    const existingLog = join(logsDirectory, 'existing.log');
    const linkedLog = join(logsDirectory, 'linked.log');
    const outside = join(root, 'outside.txt');
    await mkdir(logsDirectory, { mode: 0o755 });
    await writeFile(existingLog, 'existing\n', { mode: 0o644 });
    await writeFile(outside, 'outside\n');
    await symlink(outside, linkedLog);

    try {
      const logs = secureLogStore(logsDirectory);
      await logs.harden();

      expect((await stat(logsDirectory)).mode & 0o777).toBe(0o700);
      expect((await stat(existingLog)).mode & 0o777).toBe(0o600);
      await expect(lstat(linkedLog)).rejects.toThrow();

      await logs.write('linked.log', 'private\n');
      await expect(readFile(linkedLog, 'utf8')).resolves.toBe('private\n');
      expect((await stat(linkedLog)).mode & 0o777).toBe(0o600);
      await expect(readFile(outside, 'utf8')).resolves.toBe('outside\n');
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
