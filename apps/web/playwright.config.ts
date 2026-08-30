import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests, in a real browser.
 *
 * The claim step 8 has to support is that an administrator can complete every
 * Phase 1 task through the browser. That is not something a request-level test
 * can demonstrate — forms, redirects, sessions and the interface's own
 * permission decisions only meet each other in a browser.
 *
 * Both servers are expected to be already running. They are started by
 * `pnpm e2e`, which brings up the API and the web application together.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env['WEB_URL'] ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
