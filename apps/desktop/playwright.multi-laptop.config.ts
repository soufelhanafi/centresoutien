import { defineConfig } from '@playwright/test';

// SOU-82's multi-laptop sync spec and SOU-318's join spec each boot 3 Electron
// processes (a standalone hub + two device apps) and are deliberately excluded
// from playwright.config.ts's fast per-PR gate. This config runs them in
// isolation, driven only by the nightly workflow (.github/workflows/nightly-sync-e2e.yml).
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /multi-laptop-(sync|join)\.spec\.ts$/,
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'fr', use: { locale: 'fr-FR' } },
    { name: 'ar', use: { locale: 'ar-MA' } },
  ],
});
