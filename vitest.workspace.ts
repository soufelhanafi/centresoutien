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
      name: 'tools',
      root: '.',
      environment: 'node',
      include: ['scripts/**/*.test.mjs'],
    },
  },
]);
