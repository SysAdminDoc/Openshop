import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
    exclude: ['node_modules/**', 'tests/**/*.e2e.spec.js'],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      reportsDirectory: 'coverage',
      include: ['.coverage-temp/index.html'],
      thresholds: {
        statements: 27,
        branches: 28,
        functions: 29,
        lines: 30
      }
    }
  }
});
