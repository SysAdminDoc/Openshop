import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
    exclude: ['node_modules/**', 'tests/**/*.e2e.spec.js'],
    clearMocks: true,
    restoreMocks: true
  }
});
