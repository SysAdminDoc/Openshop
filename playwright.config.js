import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.e2e\.spec\.js/,
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  use: {
    browserName: 'chromium',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 1000 }
  }
});
