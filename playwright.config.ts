import { defineConfig, devices } from '@playwright/test';

// Lets a test route the service worker's own requests (update.spec: a newer app page on resume).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: {
    ...devices['Moto G4'],
    browserName: 'chromium',
    baseURL: 'http://localhost:4173/',
    locale: 'en-GB',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'vite preview --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: true,
  },
});
