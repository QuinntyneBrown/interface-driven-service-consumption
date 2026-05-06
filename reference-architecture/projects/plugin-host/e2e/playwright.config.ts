import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the plugin-host app. The host serves the plugin with
 * its mock framework wiring, and tests assert on `window.__pluginHostBridge`
 * to verify the plugin called the framework interface correctly.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4201',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run start:plugin-host',
    url: 'http://localhost:4201',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
