import { defineConfig, devices } from '@playwright/test';

// Chromium runs the whole suite. Firefox and WebKit run the flows tagged
// @cross-browser — open, edit, filter, save, recover, export, and the keyboard
// and dialog contracts — because the README claims full support there and a
// Chromium-only suite cannot back that claim up.
// The mobile projects are grep-gated so they exercise the compact workspace
// and capability report without duplicating the desktop suite.
export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.e2e\.spec\.js/,
  timeout: 30000,
  workers: 1,
  expect: {
    timeout: 5000
  },
  webServer: {
    command: 'node tests/server.mjs',
    url: 'http://127.0.0.1:4173',
    // CI must never inherit an unrelated process. Local reuse remains useful,
    // but every hosted/offline test verifies the server's checkout token.
    reuseExistingServer: !process.env.CI
  },
  use: {
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 1000 },
    // Keep Chromium visual baselines independent of the operator/CI desktop
    // preference. Theme-specific coverage selects its theme explicitly.
    colorScheme: 'dark'
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    {
      name: 'chromium-http',
      testMatch: /openshop\.e2e\.spec\.js/,
      metadata: { appUrl: 'http://127.0.0.1:4173/' },
      use: { browserName: 'chromium' }
    },
    { name: 'firefox', use: { browserName: 'firefox' }, grep: /@cross-browser/ },
    { name: 'webkit', use: { browserName: 'webkit' }, grep: /@cross-browser/ },
    {
      name: 'mobile-chromium',
      grep: /@mobile/,
      use: { ...devices['Pixel 5'], browserName: 'chromium' }
    },
    {
      name: 'mobile-firefox',
      grep: /@mobile/,
      use: { ...devices['Pixel 5'], browserName: 'firefox' }
    },
    {
      name: 'mobile-webkit',
      grep: /@mobile/,
      use: { ...devices['iPhone 13'], browserName: 'webkit' }
    }
  ]
});
