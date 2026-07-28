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
      include: ['src/**/*.test.ts'],
    },
  },
  {
    test: {
      name: 'data',
      root: './apps/desktop',
      environment: 'node',
      include: ['src/data/**/*.test.ts'],
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
