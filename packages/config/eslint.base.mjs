// Shared ESLint flat-config base for the Centre Soutien monorepo.
// TypeScript strict rules; no type-checked linting here (kept fast).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
export const base = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // CLAUDE.md: no `any` in application code.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
];
