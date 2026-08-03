import { base } from '@centresoutien/config/eslint.base';
import { domainBoundaries } from '@centresoutien/config/eslint.boundaries';
import { rtlLogicalProperties } from '@centresoutien/config/eslint.rtl';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/out/**', '**/node_modules/**', '**/coverage/**'] },
  ...base,
  ...domainBoundaries,
  ...rtlLogicalProperties,
  // Node-context tooling (build scripts, config files) may use Node globals.
  {
    files: ['**/scripts/**/*.mjs', '**/*.config.{ts,mjs}', '**/*.workspace.ts', 'eslint.config.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
  // Plain browser scripts served as static renderer assets (outside the
  // TypeScript/React toolchain, so they need explicit browser globals).
  {
    files: ['**/renderer/public/**/*.js'],
    languageOptions: { globals: { ...globals.browser } },
  },
);
