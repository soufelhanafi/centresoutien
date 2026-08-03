import { defineConfig } from '@playwright/test';

const PORT = 4173;

/**
 * Visual (golden-image) regression suite (SOU-146) — separate from the
 * black-box functional suite at `tests/e2e` on purpose: this one asserts
 * pixels, that one asserts behavior, and mixing the two concerns in one
 * config makes both slower and flakier to maintain.
 *
 * Rather than launching the packaged Electron app, this config serves the
 * already-built renderer bundle (`out/renderer`, produced by `pnpm build`)
 * over plain HTTP and loads it in an ordinary Chromium page, with `window.api`
 * fully mocked per screen (`support/mock-bridge.ts`). That gives every
 * baseline deterministic, hermetic data — no real dates, no SQLite, no
 * Electron/native-module startup cost — which is what golden-image
 * regression needs; the functional suite already exercises the real IPC
 * round-trip end to end.
 *
 * `fullyParallel: true` is safe here (unlike `tests/e2e`): every test gets its
 * own browser context hitting a stateless static file server, no shared
 * Electron `--user-data-dir` to serialize around.
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  timeout: 30_000,
  reporter: [['list']],
  outputDir: './test-results',
  expect: {
    // Golden-image tolerance: near-zero, since every input (mocked IPC data,
    // theme, locale) is fixed by the test itself.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  webServer: {
    command: 'node ./scripts/static-server.mjs',
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: !process.env['CI'],
    timeout: 20_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
