// Clean Architecture layer boundaries (SOU-17), enforced with ESLint.
//
// Rule of dependency direction: Presentation -> Domain <- Data.
// The Domain (packages/domain) depends on NOTHING outside itself — not React,
// not Electron, not SQLite, not Node builtins. See CLAUDE.md §3 "Forbidden imports".
//
// The workspace graph already makes app packages unresolvable from the domain;
// these rules make the violation fail fast at lint time with an explanatory
// message, and cover Node builtins the graph cannot catch.

const domainForbiddenModules = [
  { name: 'react', message: 'Domain is framework-free. React is a Presentation concern.' },
  { name: 'react-dom', message: 'Domain is framework-free. React is a Presentation concern.' },
  { name: 'electron', message: 'Domain must never import Electron.' },
  { name: 'better-sqlite3', message: 'Domain declares repository PORTS; SQLite lives in the Data layer.' },
  {
    name: 'better-sqlite3-multiple-ciphers',
    message: 'Domain declares repository PORTS; SQLCipher lives in the Data layer.',
  },
  { name: 'exceljs', message: 'Excel I/O is a Data-layer adapter, not Domain.' },
  { name: 'pdf-lib', message: 'PDF generation is a Data-layer adapter, not Domain.' },
];

// Node builtins, both bare and `node:`-prefixed.
const nodeBuiltins = ['fs', 'path', 'os', 'child_process', 'crypto', 'process'];
const domainForbiddenNode = nodeBuiltins.flatMap((m) => [
  { name: m, message: `Domain must not touch Node builtins (${m}). Inject a port instead.` },
  { name: `node:${m}`, message: `Domain must not touch Node builtins (node:${m}). Inject a port instead.` },
]);

const domainForbiddenPatterns = [
  {
    group: ['@centresoutien/ui', '@centresoutien/desktop', '@centresoutien/landing'],
    message: 'Domain must not depend on UI or app packages. Dependencies point INTO the domain.',
  },
];

/** @type {import('eslint').Linter.Config[]} */
export const domainBoundaries = [
  {
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [...domainForbiddenModules, ...domainForbiddenNode],
          patterns: domainForbiddenPatterns,
        },
      ],
      // Defense in depth: no browser globals in the portable core.
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'Domain must not reference browser globals.' },
        { name: 'document', message: 'Domain must not reference browser globals.' },
      ],
    },
  },
  // Domain test files (audit tools, etc.) may read source and migration files
  // from disk — they're infrastructure that verifies invariants, not Domain logic.
  {
    files: ['packages/domain/tests/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  // Presentation (renderer) must not reach the Data layer or SQLite directly —
  // all data access goes through Domain use cases via the IPC bridge.
  // Ready for when the renderer/data layers land (SOU-15 / SOU-18).
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'better-sqlite3-multiple-ciphers', message: 'Renderer must not import SQLite. Go through IPC + Domain.' },
            { name: 'fs', message: 'Renderer must not import fs. Go through IPC + Domain.' },
            { name: 'node:fs', message: 'Renderer must not import fs. Go through IPC + Domain.' },
          ],
          patterns: [{ group: ['**/data/**'], message: 'Renderer must not import the Data layer directly.' }],
        },
      ],
    },
  },
];
