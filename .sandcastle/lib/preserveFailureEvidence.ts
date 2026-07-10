import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface FailureEvidenceOptions {
  readonly issueNumber: number;
  readonly logsDirectory: string;
  readonly reason: string;
  readonly worktreePath: string;
}

function pathIsMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function issueLogNames(logsDirectory: string, issueNumber: number): Promise<string[]> {
  try {
    const entries = await readdir(logsDirectory, { withFileTypes: true });
    const prefix = `sandcastle-issue-${issueNumber}-`;
    return entries
      .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (pathIsMissing(error)) {
      return [];
    }
    throw error;
  }
}

/** Persist a terminal failure summary and this issue's captured agent logs. */
export async function preserveFailureEvidence(options: FailureEvidenceOptions): Promise<string> {
  const relativeDirectory = `.sandcastle/reports/issue-${options.issueNumber}`;
  const relativePath = `${relativeDirectory}/failure.md`;
  const reportDirectory = join(options.worktreePath, relativeDirectory);
  const reproDirectory = join(reportDirectory, 'repro');
  const logNames = await issueLogNames(options.logsDirectory, options.issueNumber);

  await mkdir(reportDirectory, { recursive: true });
  if (logNames.length > 0) {
    await mkdir(reproDirectory, { recursive: true });
    await Promise.all(
      logNames.map((name) =>
        copyFile(join(options.logsDirectory, name), join(reproDirectory, name)),
      ),
    );
  }

  const reproSummary =
    logNames.length === 0
      ? 'No captured agent logs were available.'
      : logNames.map((name) => `- [${name}](repro/${name})`).join('\n');
  await writeFile(
    join(options.worktreePath, relativePath),
    `# Sandcastle terminal failure\n\n${options.reason}\n\n## Repro logs\n\n${reproSummary}\n`,
  );

  return relativePath;
}
