import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the framework-host app. The host wires the REAL
 * `DashboardStateStore` and `DashboardWidgetService`. Tests reach into
 * `window.__frameworkHostBridge` to drive the store, and intercept HTTP at
 * the network layer to verify the request the framework's HTTP service
 * actually emits when `loadWidgets()` runs.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4202',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run start:framework-host',
    url: 'http://localhost:4202',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
