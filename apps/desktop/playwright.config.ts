import { defineConfig } from '@playwright/test';

// E2E against the built Electron app (SOU-24). FR and AR projects give RTL
// coverage. The app must be built first (`pnpm build`) so out/main/index.js exists.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'fr', use: { locale: 'fr-FR' } },
    { name: 'ar', use: { locale: 'ar-MA' } },
  ],
});
