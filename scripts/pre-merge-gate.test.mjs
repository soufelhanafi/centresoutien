import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GATES, scanForViolations } from './pre-merge-gate.mjs';

let root;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gate-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** @param {string} rel @param {string} contents */
function write(rel, contents) {
  const abs = join(root, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, contents);
}

describe('pre-merge gate scanner', () => {
  it('passes on a clean tree', () => {
    write('packages/domain/src/index.ts', 'export const x = 1;\n');
    write('apps/desktop/src/data/repo.ts', 'export const y = 2;\n');
    expect(scanForViolations(root)).toEqual([]);
  });

  it('flags `new Date()` in the domain', () => {
    write('packages/domain/src/clock.ts', 'export const t = new Date();\n');
    const v = scanForViolations(root);
    expect(v).toHaveLength(1);
    expect(v[0].gate).toBe('no-new-date-in-domain');
  });

  it('allows `new Date()` OUTSIDE the domain (e.g. Data layer)', () => {
    write('apps/desktop/src/data/clock.ts', 'export const t = new Date();\n');
    expect(scanForViolations(root)).toEqual([]);
  });

  it('flags `DELETE FROM` in SQL and Data-layer code', () => {
    write('apps/desktop/src/data/migrations/0001.sql', 'DELETE FROM students;\n');
    write('apps/desktop/src/data/student-repo.ts', "db.exec('delete from parents');\n");
    const gates = scanForViolations(root).map((v) => v.gate);
    expect(gates.filter((g) => g === 'no-hard-delete')).toHaveLength(2);
  });

  it('flags `AUTOINCREMENT` in SQL', () => {
    write('apps/desktop/src/data/migrations/0001.sql', 'id INTEGER PRIMARY KEY AUTOINCREMENT\n');
    const v = scanForViolations(root);
    expect(v).toHaveLength(1);
    expect(v[0].gate).toBe('no-autoincrement');
  });

  it('does not scan node_modules or dist', () => {
    write('node_modules/pkg/src/index.ts', 'const t = new Date();\n');
    write('packages/domain/dist/index.js', 'const t = new Date();\n');
    expect(scanForViolations(root)).toEqual([]);
  });

  it('does NOT flag a banned pattern that appears only inside a comment', () => {
    write(
      'packages/domain/src/clock.ts',
      [
        '/**',
        ' * The domain never calls `new Date()` directly.',
        ' */',
        'export const x = 1; // avoid new Date() here too',
      ].join('\n'),
    );
    write('apps/desktop/src/data/m.sql', '-- DELETE FROM students is forbidden; AUTOINCREMENT too\n');
    expect(scanForViolations(root)).toEqual([]);
  });

  it('still flags a banned pattern in real code even with a trailing comment', () => {
    write('packages/domain/src/clock.ts', 'export const t = new Date(); // oops\n');
    const v = scanForViolations(root);
    expect(v).toHaveLength(1);
    expect(v[0].gate).toBe('no-new-date-in-domain');
  });

  it('exposes exactly the three documented gates', () => {
    expect(GATES.map((g) => g.name)).toEqual([
      'no-new-date-in-domain',
      'no-hard-delete',
      'no-autoincrement',
    ]);
  });
});
