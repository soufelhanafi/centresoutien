import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import { openDatabase } from '../../src/data/sqlite/db';
import { applyMigrations, loadMigrations } from '../../src/data/sqlite/migration-runner';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');

let dir: string;
let db: DB;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-0049-migrate-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function migrateToBefore0049() {
  const migrations = loadMigrations(REAL_MIGRATIONS);
  const target = migrations.find((m) => m.name.includes('formula_subject_prices'));
  if (!target) throw new Error('0049 migration not found');
  applyMigrations(
    db,
    migrations.filter((m) => m.version < target.version),
  );
  return target;
}

function columnNames(table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

describe('migration 0049 weighted attribution columns', () => {
  it('adds formulas.subject_prices, defaulting existing rows to NULL (equal-split fallback)', () => {
    const target = migrateToBefore0049();

    // A formula written on the OLD schema — no subject_prices column yet.
    db.prepare(
      `INSERT INTO formulas
         (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version,
          name_fr, name_ar, subject_ids, price_mad, kind, is_immutable, active)
       VALUES
         ('fml_00000000000000000000000001', 'CS-CASA-001', 'dev_1', '2026-07-01T00:00:00Z',
          '2026-07-01T00:00:00Z', 'usr_1', NULL, 0, 'Math', 'رياضيات',
          '["sub_00000000000000000000000001"]', 20000, 'regular', 0, 1)`,
    ).run();

    applyMigrations(db, [target]);

    expect(columnNames('formulas')).toContain('subject_prices');
    const row = db
      .prepare('SELECT subject_prices FROM formulas WHERE id = ?')
      .get('fml_00000000000000000000000001') as { subject_prices: string | null };
    expect(row.subject_prices).toBeNull();
  });

  it('adds invoices.subject_allocation, defaulting existing rows to NULL (weighted default)', () => {
    const target = migrateToBefore0049();

    db.prepare(
      `INSERT INTO invoices
         (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version,
          student_id, month, status, issued_at, cancelled_at)
       VALUES
         ('inv_00000000000000000000000001', 'CS-CASA-001', 'dev_1', '2026-07-01T00:00:00Z',
          '2026-07-01T00:00:00Z', 'usr_1', NULL, 0, 'stu_1', '2026-07', 'issued',
          '2026-07-01T00:00:00Z', NULL)`,
    ).run();

    applyMigrations(db, [target]);

    expect(columnNames('invoices')).toContain('subject_allocation');
    const row = db
      .prepare('SELECT subject_allocation FROM invoices WHERE id = ?')
      .get('inv_00000000000000000000000001') as { subject_allocation: string | null };
    expect(row.subject_allocation).toBeNull();
  });

  it('leaves the envelope change-tracking columns untouched (no phantom sync traffic)', () => {
    const target = migrateToBefore0049();
    db.prepare(
      `INSERT INTO formulas
         (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version,
          name_fr, name_ar, subject_ids, price_mad, kind, is_immutable, active)
       VALUES
         ('fml_00000000000000000000000002', 'CS-CASA-001', 'dev_1', '2026-07-01T00:00:00Z',
          '2026-07-01T00:00:00Z', 'usr_1', NULL, 3, 'Math', 'رياضيات',
          '["sub_00000000000000000000000001"]', 20000, 'regular', 0, 1)`,
    ).run();

    applyMigrations(db, [target]);

    const row = db
      .prepare('SELECT updated_at, updated_by, version FROM formulas WHERE id = ?')
      .get('fml_00000000000000000000000002') as {
      updated_at: string;
      updated_by: string;
      version: number;
    };
    expect(row).toEqual({ updated_at: '2026-07-01T00:00:00Z', updated_by: 'usr_1', version: 3 });
  });

  it('replays the full chain from scratch, adding each column exactly once', () => {
    applyMigrations(db, loadMigrations(REAL_MIGRATIONS));
    expect(columnNames('formulas').filter((c) => c === 'subject_prices')).toHaveLength(1);
    expect(columnNames('invoices').filter((c) => c === 'subject_allocation')).toHaveLength(1);
  });
});
