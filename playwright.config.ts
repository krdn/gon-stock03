import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4314', viewport: { width: 1440, height: 1050 }, trace: 'retain-on-failure' },
  webServer: { command: 'node --import tsx scripts/e2e-server.ts', url: 'http://127.0.0.1:4314', reuseExistingServer: false, timeout: 30000 },
  reporter: [['list'], ['html', { open: 'never' }]],
});
