import { defineConfig } from 'vitest/config';

/** Unit-test configuration for source files outside the e2e harness. */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['src/e2e/**'],
  },
});
