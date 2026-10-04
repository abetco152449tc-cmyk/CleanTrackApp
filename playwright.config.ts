import { defineConfig } from '@playwright/test';
const port = process.env.PLAYWRIGHT_PORT || '8081';
const staticExport = process.env.PLAYWRIGHT_STATIC_EXPORT === 'true';
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  testIgnore: '**/firebase-account.spec.ts',
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: 'chrome',
    viewport: { width: 390, height: 844 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    stdout: 'pipe',
    command: staticExport
      ? `node tests/static-web-server.cjs --demo --port ${port}`
      : `npx expo start --web --clear --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: { EXPO_PUBLIC_CLEANTRACK_DEMO: 'true' },
    timeout: Number(process.env.PLAYWRIGHT_STARTUP_TIMEOUT || (staticExport ? 600000 : 180000)),
  },
});
