import { defineWorkspace } from 'vitest/config';

// Test projects for the monorepo (SOU-23).
// - domain: the portable core, node env, NO DOM.
// - data:   Data-layer adapters (in-memory SQLite), node env. Populated in SOU-18.
// - tools:  repo tooling (the pre-merge gate scanner).
export default defineWorkspace([
  {
    test: {
      name: 'domain',
      root: './packages/domain',
      environment: 'node',
      // Tests live inside the package, mirroring src/ (CLAUDE.md §3).
      include: ['tests/**/*.test.ts'],
    },
  },
  {
    // `__CS_E2E__` is the electron-vite build-time flag the composition root's
    // license trust-anchor seam gates on (SOU-172). Under vitest it defaults to
    // `false` — matching a normal dev/release build — so the seam's env-override
    // branch stays compiled out; integration tests inject via `options.license`.
    define: { __CS_E2E__: 'false' },
    // Resolve `electron` to a no-op stub so a main-process module under test never
    // loads the real package — importing it in plain Node can trigger an Electron
    // binary download via `@electron/get`, a CDN dependency that flaked the CI
    // unit-test job (SOU-229). A test needing bespoke behaviour still overrides this
    // with its own `vi.mock('electron', …)`.
    resolve: {
      alias: { electron: new URL('./apps/desktop/tests/electron-stub.ts', import.meta.url).pathname },
    },
    test: {
      name: 'desktop',
      root: './apps/desktop',
      environment: 'node',
      // Composition-root infra (Clock/IdGenerator adapters) + future Data-layer tests.
      include: ['tests/**/*.test.ts'],
      passWithNoTests: true,
    },
  },
  {
    esbuild: { jsx: 'automatic' },
    resolve: {
      alias: {
        '@ui': new URL('./packages/ui/src', import.meta.url).pathname,
        // OverlayScrollbars (SOU-216) measures layout via getComputedStyle,
        // which jsdom cannot resolve — swap in a children-preserving stub for
        // renderer unit tests. E2E runs the real lib under Chromium.
        'overlayscrollbars-react': new URL(
          './apps/desktop/tests/renderer/overlayscrollbars-stub.tsx',
          import.meta.url,
        ).pathname,
      },
    },
    test: {
      name: 'renderer',
      root: './apps/desktop',
      environment: 'jsdom',
      include: ['tests/renderer/**/*.test.tsx'],
      setupFiles: ['./tests/renderer/setup.ts'],
    },
  },
  {
    test: {
      name: 'landing',
      root: './apps/landing',
      environment: 'node',
      include: ['lib/**/*.test.ts'],
      passWithNoTests: true,
    },
  },
  {
    test: {
      name: 'tools',
      root: '.',
      environment: 'node',
      include: ['scripts/**/*.test.mjs'],
    },
  },
]);
