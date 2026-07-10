import { runAfk } from './afk-runner.js';

describe('Sandcastle AFK entrypoint', () => {
  it('exports the queue-draining runner without executing it on import', () => {
    expect(runAfk).toBeTypeOf('function');
  });
});
