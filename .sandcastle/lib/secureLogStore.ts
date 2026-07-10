import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

interface SecureLogStore {
  readonly harden: () => Promise<void>;
  readonly write: (name: string, contents: string) => Promise<void>;
}

/** Create a private host-log boundary with no-follow file writes. */
export function secureLogStore(directory: string): SecureLogStore {
  const harden = async (): Promise<void> => {
    await mkdir(directory, { mode: 0o700, recursive: true });
    const directoryInfo = await lstat(directory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) {
      throw new Error(`Secure log path is not a regular directory: ${directory}`);
    }
    await chmod(directory, 0o700);
    const entries = await readdir(directory, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name);
        if (entry.isSymbolicLink()) {
          await rm(path, { force: true });
          return;
        }
        if (!entry.isFile()) {
          throw new Error(`Unexpected entry in secure log directory: ${entry.name}`);
        }
        await chmod(path, 0o600);
      }),
    );
  };

  return {
    harden,
    write: async (name, contents) => {
      if (!/^[a-z0-9][a-z0-9.-]*\.log$/u.test(name)) {
        throw new Error(`Invalid secure log filename: ${name}`);
      }
      await harden();
      const path = join(directory, name);
      const handle = await open(
        path,
        constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
        0o600,
      );
      try {
        await handle.writeFile(contents);
      } finally {
        await handle.close();
      }
      await chmod(path, 0o600);
    },
  };
}
