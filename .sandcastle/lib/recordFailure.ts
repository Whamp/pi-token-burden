import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface RecordFailureOptions {
  readonly issueNumber: number;
  readonly logsDirectory: string;
  readonly reason: string;
}

interface RecordedFailure {
  readonly failureId: string;
  readonly logName: string;
  readonly safeReason: string;
}

/** Retain a raw failure locally and return disclosure-safe public metadata. */
export async function recordFailure(options: RecordFailureOptions): Promise<RecordedFailure> {
  const failureId = createHash('sha256').update(options.reason).digest('hex').slice(0, 12);
  const logName = `sandcastle-issue-${options.issueNumber}-runner-error-${failureId}.log`;
  await mkdir(options.logsDirectory, { recursive: true });
  await writeFile(join(options.logsDirectory, logName), `${options.reason}\n`);
  return {
    failureId,
    logName,
    safeReason: `Sandcastle workflow failed (failure ID: ${failureId}). Raw details are retained only in the runner host log \`.sandcastle/logs/${logName}\`.`,
  };
}
