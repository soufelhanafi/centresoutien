// Pre-merge grep gates (SOU-89).
//
// Fast, dependency-free guards for rules the type system can't express.
// Each gate is narrowly scoped by path so documentation that merely *mentions*
// a banned pattern (CLAUDE.md, specs) never trips it.
//
// Gates:
//   1. no `new Date()` under packages/domain/src  — timestamps come from the
//      injected Clock port (CLAUDE.md §5). Wall-clock time never in the domain.
//   2. no `DELETE FROM` in SQL or Data-layer code  — soft delete only; hard
//      deletes break tombstone sync (CLAUDE.md §5 / §13).
//   3. no `AUTOINCREMENT` in SQL                    — IDs are ULIDs, not
//      server-assigned integers (sync-safe entities).
//
// Usage:  node scripts/pre-merge-gate.mjs        (scans process.cwd(), exits 1 on any violation)
// Import: { scanForViolations, GATES } for unit tests.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'coverage']);

/** @typedef {{ name: string, applies: (relPath: string) => boolean, pattern: RegExp, message: string }} Gate */

/** @type {Gate[]} */
export const GATES = [
  {
    name: 'no-new-date-in-domain',
    applies: (p) => p.startsWith(`packages${sep}domain${sep}src${sep}`) && p.endsWith('.ts'),
    pattern: /\bnew\s+Date\s*\(/,
    message: 'Use the injected Clock port, not `new Date()`, in the domain (CLAUDE.md §5).',
  },
  {
    name: 'no-hard-delete',
    applies: (p) => p.endsWith('.sql') || (p.endsWith('.ts') && p.includes(`${sep}data${sep}`)),
    pattern: /\bDELETE\s+FROM\b/i,
    message: 'Hard deletes are forbidden — set `deletedAt` (soft delete) instead (CLAUDE.md §13).',
  },
  {
    name: 'no-autoincrement',
    applies: (p) => p.endsWith('.sql'),
    pattern: /\bAUTOINCREMENT\b/i,
    message: 'IDs are ULIDs, not AUTOINCREMENT integers (sync-safe entities).',
  },
];

/**
 * Walk `root` and return every gate violation.
 * @param {string} root
 * @returns {{ gate: string, file: string, line: number, text: string, message: string }[]}
 */
export function scanForViolations(root) {
  const violations = [];

  /** @param {string} dir */
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      const st = statSync(abs);
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(entry)) walk(abs);
        continue;
      }
      const rel = relative(root, abs);
      const gates = GATES.filter((g) => g.applies(rel));
      if (gates.length === 0) continue;

      const lines = readFileSync(abs, 'utf8').split('\n');
      for (const gate of gates) {
        lines.forEach((text, i) => {
          if (gate.pattern.test(text)) {
            violations.push({ gate: gate.name, file: rel, line: i + 1, text: text.trim(), message: gate.message });
          }
        });
      }
    }
  }

  walk(root);
  return violations;
}

// CLI entry point.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd();
  const violations = scanForViolations(root);
  if (violations.length === 0) {
    console.log('✓ pre-merge gates passed (no new Date() in domain, no DELETE FROM, no AUTOINCREMENT)');
    process.exit(0);
  }
  console.error(`✗ pre-merge gates failed — ${violations.length} violation(s):\n`);
  for (const v of violations) {
    console.error(`  [${v.gate}] ${v.file}:${v.line}\n    ${v.text}\n    → ${v.message}\n`);
  }
  process.exit(1);
}
