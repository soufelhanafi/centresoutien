import { base } from '@centresoutien/config/eslint.base';
import { domainBoundaries } from '@centresoutien/config/eslint.boundaries';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  ...base,
  ...domainBoundaries,
  // Node-context tooling (build scripts, config files) may use Node globals.
  {
    files: ['scripts/**/*.mjs', '**/*.config.{ts,mjs}', '**/*.workspace.ts', 'eslint.config.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
);
