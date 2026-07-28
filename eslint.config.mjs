import { base } from '@centresoutien/config/eslint.base';
import { domainBoundaries } from '@centresoutien/config/eslint.boundaries';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  ...base,
  ...domainBoundaries,
);
