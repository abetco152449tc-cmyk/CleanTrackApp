import { defineConfig } from '@playwright/test';
const staticExport = process.env.PLAYWRIGHT_STATIC_EXPORT === 'true';
export default defineConfig({
  testDir: './tests',
  testMatch: 'firebase-account.spec.ts',
  grep: process.env.PLAYWRIGHT_AUTH_GREP ? new RegExp(process.env.PLAYWRIGHT_AUTH_GREP) : undefined,
  timeout: 180000,
  expect: { timeout: 20000 },
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8092',
    channel: 'chrome',
    viewport: { width: 390, height: 844 },
    actionTimeout: 30000,
    navigationTimeout: 60000,
  },
  webServer: {
    stdout: 'pipe',
    command: staticExport
      ? 'node tests/static-web-server.cjs --port 8092'
      : 'npx expo start --web --clear --port 8092',
    url: 'http://127.0.0.1:8092',
    reuseExistingServer: false,
    timeout: Number(process.env.PLAYWRIGHT_STARTUP_TIMEOUT || (staticExport ? 600000 : 180000)),
    env: {
      EXPO_PUBLIC_CLEANTRACK_DEMO: 'false',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'demo-cleantrack',
      EXPO_PUBLIC_FIREBASE_API_KEY: 'fake-key',
      EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'demo-cleantrack.firebaseapp.com',
      EXPO_PUBLIC_FIREBASE_APP_ID: '1:123:web:demo',
      EXPO_PUBLIC_FIREBASE_EMULATOR_HOST: '127.0.0.1',
    },
  },
});
