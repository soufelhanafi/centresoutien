import { defineConfig } from 'vitest/config';

// Root config supplies coverage (workspace files can't). Projects come from
// vitest.workspace.ts. Coverage is scoped to the domain for now — that's where
// CLAUDE.md §9's 90% floor applies; it broadens as data/renderer code lands.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/domain/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/__tests__/**'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
