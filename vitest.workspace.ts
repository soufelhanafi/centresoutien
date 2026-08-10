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
    // The demo-credential build constants (SOU-186) resolve to `""` here so the
    // accessor's build-time fallback is empty and tests drive it purely via
    // `process.env` (set/unset per case); the real values come from `loadEnv` in
    // electron.vite.config.ts at build time.
    define: { __CS_E2E__: 'false', __CS_DEMO_USERNAME__: '""', __CS_DEMO_PASSWORD__: '""' },
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
      alias: { '@ui': new URL('./packages/ui/src', import.meta.url).pathname },
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
