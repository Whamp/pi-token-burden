import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface FailureEvidenceOptions {
  readonly issueNumber: number;
  readonly logsDirectory: string;
  readonly failureId: string;
  readonly worktreePath: string;
}

function pathIsMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function issueLogNames(logsDirectory: string, issueNumber: number): Promise<string[]> {
  try {
    const entries = await readdir(logsDirectory, { withFileTypes: true });
    const issueLogPattern = new RegExp(`^sandcastle-issue-${issueNumber}-[a-z0-9-]+\\.log$`, 'u');
    return entries
      .filter((entry) => entry.isFile() && issueLogPattern.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (pathIsMissing(error)) {
      return [];
    }
    throw error;
  }
}

async function logManifest(logsDirectory: string, names: readonly string[]): Promise<string> {
  if (names.length === 0) {
    return 'No captured agent logs were available.';
  }
  const entries = await Promise.all(
    names.map(async (name) => {
      const contents = await readFile(join(logsDirectory, name));
      const digest = createHash('sha256').update(contents).digest('hex');
      return `- \`.sandcastle/logs/${name}\` — ${contents.byteLength} bytes — sha256 \`${digest}\``;
    }),
  );
  return entries.join('\n');
}

/** Persist a terminal failure summary without publishing raw agent transcripts. */
export async function preserveFailureEvidence(options: FailureEvidenceOptions): Promise<string> {
  const relativeDirectory = `.sandcastle/reports/issue-${options.issueNumber}`;
  const relativePath = `${relativeDirectory}/failure.md`;
  const reportDirectory = join(options.worktreePath, relativeDirectory);
  const logNames = await issueLogNames(options.logsDirectory, options.issueNumber);
  const manifest = await logManifest(options.logsDirectory, logNames);

  await rm(reportDirectory, { force: true, recursive: true });
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(
    join(options.worktreePath, relativePath),
    `# Sandcastle terminal failure\n\nSandcastle workflow failed (failure ID: ${options.failureId}). Raw details are retained only on the runner host.\n\n## Repro evidence\n\nRaw logs are retained only on the runner host and are not copied into Git.\n\n${manifest}\n`,
  );

  return relativePath;
}
