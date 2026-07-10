import { defineConfig } from 'vitest/config';

/** Tmux-backed end-to-end test configuration. */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/e2e/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 20_000,
  },
});
