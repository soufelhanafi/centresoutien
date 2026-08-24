import { base } from '@centresoutien/config/eslint.base';
import { domainBoundaries } from '@centresoutien/config/eslint.boundaries';
import { rtlLogicalProperties } from '@centresoutien/config/eslint.rtl';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Stale agent worktree scratch (`.claude/worktrees/**`) is gitignored and
    // owned by separate git worktrees — linting it would fail CI on files that
    // are not part of the repo.
    ignores: [
      '**/dist/**',
      '**/out/**',
      '**/node_modules/**',
      '**/coverage/**',
      '.claude/worktrees/**',
      // apps/landing is the imported Next.js marketing site: it owns its own
      // eslint-config-next flat config (`apps/landing/eslint.config.mjs`) and
      // is linted via `pnpm --filter @centresoutien/landing lint`, not the
      // desktop-strict ruleset here.
      'apps/landing/**',
    ],
  },
  ...base,
  ...domainBoundaries,
  ...rtlLogicalProperties,
  // Node-context tooling (build scripts, config files) may use Node globals.
  {
    files: ['**/scripts/**/*.mjs', '**/*.config.{ts,mjs}', '**/*.workspace.ts', 'eslint.config.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  // CommonJS build-tooling scripts (e.g. the electron-builder Windows sign
  // hook): the desktop package is ESM, so a script electron-builder `require`s
  // must be `.cjs` using require/module.exports.
  {
    files: ['**/build/**/*.cjs'],
    languageOptions: { globals: { ...globals.node }, sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  // Plain browser scripts served as static renderer assets (outside the
  // TypeScript/React toolchain, so they need explicit browser globals).
  {
    files: ['**/renderer/public/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
);
