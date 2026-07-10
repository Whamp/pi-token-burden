import { logError, logInfo } from './logger.js';

describe('Sandcastle logger', () => {
  it('writes structured information and error events', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    logInfo('claimed', { issueNumber: 42 });
    logError('failed', { issueNumber: 42 });

    expect(stdout).toHaveBeenCalledWith(
      '{"context":{"issueNumber":42},"level":"info","message":"claimed"}\n',
    );
    expect(stderr).toHaveBeenCalledWith(
      '{"context":{"issueNumber":42},"level":"error","message":"failed"}\n',
    );
  });
});
