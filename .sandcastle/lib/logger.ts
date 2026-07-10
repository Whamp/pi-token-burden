interface LogContext {
  readonly [key: string]: unknown;
}

function writeLog(
  stream: NodeJS.WriteStream,
  level: string,
  message: string,
  context: LogContext,
): void {
  stream.write(`${JSON.stringify({ context, level, message })}\n`);
}

/** Write a structured informational event. */
export function logInfo(message: string, context: LogContext = {}): void {
  writeLog(process.stdout, 'info', message, context);
}

/** Write a structured error event. */
export function logError(message: string, context: LogContext = {}): void {
  writeLog(process.stderr, 'error', message, context);
}
