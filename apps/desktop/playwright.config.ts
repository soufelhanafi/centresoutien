import { defineConfig } from '@playwright/test';

// E2E against the built Electron app (SOU-24). FR and AR projects give RTL
// coverage. The app must be built first (`pnpm build`) so out/main/index.js exists.
//
// multi-laptop-sync.spec.ts (SOU-82) boots 3 Electron processes and is excluded
// here — it runs only via the dedicated nightly config (see
// playwright.multi-laptop.config.ts), never on the fast per-PR gate.
export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: /multi-laptop-sync\.spec\.ts$/,
  globalSetup: './tests/e2e/global-setup.ts',
  // Each spec launches its own Electron process with a throwaway
  // `--user-data-dir` (mkdtemp) and any local server binds an ephemeral port
  // (`listen(0)`), so specs are isolated across processes. `fullyParallel:
  // false` keeps the unit of parallelism the whole (file × project) — tests
  // inside a file still run in order (preserving the few `beforeAll`-shared
  // apps) while distinct files and the fr/ar projects run concurrently across
  // workers. On CI this turns a ~1h serial run into minutes.
  fullyParallel: false,
  // Each Electron launch spawns a full browser process tree; the macos-latest
  // runner has 3 cores, so 3 workers parallelize the (file × project) units
  // without oversubscribing. This is the change that turns the old serial
  // (workers: 1) ~1h run into minutes, on the same proven-green suite.
  workers: process.env['CI'] ? 3 : 1,
  // Absorb the occasional flake a parallel run can surface (a toast animation
  // caught mid-transition, a slow boot under load); two retries keep a stray
  // flake from failing the whole gate.
  retries: process.env['CI'] ? 2 : 0,
  // App first-run boot (seed admin + login + reload) can approach the default
  // under load; 45s gives headroom so a slow-but-healthy boot isn't a failure.
  timeout: 45_000,
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
