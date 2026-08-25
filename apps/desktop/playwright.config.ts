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
  // Each Electron launch spawns a full browser process tree; the ubuntu-latest
  // runner has 4 cores, so 3 concurrent apps saturate it without the overload
  // that made electron.launch fail with `spawn ETXTBSY` and boots blow the
  // timeout at 6 workers. Still a big win over the old serial (workers: 1) run.
  workers: process.env['CI'] ? 3 : 1,
  // Absorb the occasional transient launch race (ETXTBSY) that survives even at
  // a sane worker count; two retries keep a stray flake from failing the gate.
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
