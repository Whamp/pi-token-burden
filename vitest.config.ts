import { defineConfig } from 'vitest/config';

/** Unit-test configuration for source files outside the e2e harness. */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', '.sandcastle/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '.sandcastle/cache/**',
      '.sandcastle/worktrees/**',
      'src/e2e/**',
    ],
  },
});
