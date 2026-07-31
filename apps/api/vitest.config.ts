import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Each test builds its own in-memory database, so files are independent.
    include: ['src/**/*.test.ts'],
  },
});
