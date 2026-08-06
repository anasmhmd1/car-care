import { defineConfig, devices } from '@playwright/test';
import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

const configuredBaseURL = process.env.E2E_BASE_URL?.trim();
const configuredPort = process.env.E2E_PORT?.trim();
if (configuredPort && !/^\d{2,5}$/.test(configuredPort)) {
  throw new Error('E2E_PORT must be a valid TCP port.');
}
const localPort = configuredPort || '3000';
const baseURL = configuredBaseURL || `http://localhost:${localPort}`;
const managesLocalServer = !configuredBaseURL;

export default defineConfig({
  testDir: './e2e',
  // Server Actions can include a cold route compilation plus remote database
  // round-trips. Acceptance assertions should observe the settled UI/DB state
  // instead of inheriting Playwright's unit-test-oriented five-second default.
  expect: { timeout: 45_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Acceptance scenarios mutate a disposable database and clean up afterward;
  // one worker prevents their fixtures and branch-limit snapshots overlapping.
  workers: 1,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: managesLocalServer
    ? {
        command: `npm run dev -- --hostname localhost --port ${localPort}`,
        url: baseURL,
        reuseExistingServer:
          !process.env.CI && process.env.E2E_ISOLATED_RUNNER !== '1',
        timeout: 120 * 1000,
      }
    : undefined,
});
