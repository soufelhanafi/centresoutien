import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import { openDatabase, openDatabaseAt } from '../../src/data/sqlite/db';
import { applyMigrations, backupDatabase, loadMigrations } from '../../src/data/sqlite/migration-runner';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-mig41-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Apply everything up to 0040 — the pre-split-day schema, with 0041 pending. */
function migrateToSplitDayPredecessor(db: DB): void {
  const all = loadMigrations(REAL_MIGRATIONS);
  applyMigrations(db, all.filter((migration) => migration.version <= 40));
}

type LegacyHoursRow = {
  id: string;
  day_of_week: number;
  open: string | null;
  close: string | null;
  updated_at: string;
  updated_by: string;
  version: number;
};

type HoursRow = LegacyHoursRow & { windows: string };

const ENVELOPE_COLUMNS = ['updated_at', 'updated_by', 'version', 'created_at', 'deleted_at'] as const;

function insertLegacyRow(db: DB, row: LegacyHoursRow): void {
  db.prepare(
    `INSERT INTO center_hours
       (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, day_of_week, open, close)
     VALUES (@id, 'CS-CASA-001', 'dev_1', '2026-01-01T10:00:00.000Z', @updated_at, @updated_by, NULL, @version, @day_of_week, @open, @close)`,
  ).run(row);
}

const BASE_COLUMNS = [
  'id',
  'day_of_week',
  'open',
  'close',
  'updated_at',
  'updated_by',
  'version',
  'created_at',
  'deleted_at',
];

function hoursRows(db: DB, extraColumns: readonly string[] = []): HoursRow[] {
  return db
    .prepare(`SELECT ${[...BASE_COLUMNS, ...extraColumns].join(', ')} FROM center_hours ORDER BY day_of_week`)
    .all() as HoursRow[];
}

function seedLegacyFixture(db: DB): void {
  insertLegacyRow(db, {
    id: 'chr_00000000000000000000000001',
    day_of_week: 0,
    open: null,
    close: null,
    updated_at: '2026-01-02T10:00:00.000Z',
    updated_by: 'usr_00000000000000000000000001',
    version: 3,
  });
  insertLegacyRow(db, {
    id: 'chr_00000000000000000000000002',
    day_of_week: 1,
    open: '09:00',
    close: '18:00',
    updated_at: '2026-02-01T08:30:00.000Z',
    updated_by: 'usr_00000000000000000000000002',
    version: 7,
  });
  insertLegacyRow(db, {
    id: 'chr_00000000000000000000000003',
    day_of_week: 2,
    open: '08:30',
    close: '17:45',
    updated_at: '2026-03-11T12:00:00.000Z',
    updated_by: 'usr_00000000000000000000000003',
    version: 12,
  });
}

describe('0041 center_hours_split_day', () => {
  it('backfills open rows to a single window and closed rows to []', () => {
    const db = openDatabase({ centreId: 'C1', key: KEY, dir });
    migrateToSplitDayPredecessor(db);
    seedLegacyFixture(db);
    applyMigrations(db, loadMigrations(REAL_MIGRATIONS));

    const rows = hoursRows(db, ['windows']);
    expect(rows.map((row) => row.windows)).toEqual([
      '[]',
      '[{"open":"09:00","close":"18:00"}]',
      '[{"open":"08:30","close":"17:45"}]',
    ]);

    // The legacy columns remain in the schema (dead columns, rename dance §4).
    const columns = db.prepare('PRAGMA table_info(center_hours)').all() as { name: string }[];
    const names = columns.map((column) => column.name);
    expect(names).toContain('open');
    expect(names).toContain('close');
    expect(names).toContain('windows');
    db.close();
  });

  it('is sync-neutral: the backfill never touches updated_at / updated_by / version', () => {
    const db = openDatabase({ centreId: 'C1', key: KEY, dir });
    migrateToSplitDayPredecessor(db);
    seedLegacyFixture(db);
    const before = hoursRows(db).map((row) => ({
      id: row.id,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
      version: row.version,
    }));

    applyMigrations(db, loadMigrations(REAL_MIGRATIONS));
    const after = hoursRows(db).map((row) => ({
      id: row.id,
      updated_at: row.updated_at,
      updated_by: row.updated_by,
      version: row.version,
    }));

    expect(after).toEqual(before);
    db.close();
  });

  it('is deterministic across two copies of the same fixture (migration-authoring §6.4)', () => {
    const source = openDatabase({ centreId: 'C1', key: KEY, dir });
    migrateToSplitDayPredecessor(source);
    seedLegacyFixture(source);
    const copyA = join(dir, 'copy-a.db');
    const copyB = join(dir, 'copy-b.db');
    backupDatabase(source, copyA);
    backupDatabase(source, copyB);
    source.close();

    const migrateCopy = (file: string): HoursRow[] => {
      const db = openDatabaseAt(file, KEY);
      applyMigrations(db, loadMigrations(REAL_MIGRATIONS));
      const rows = hoursRows(db, ['windows']);
      db.close();
      return rows;
    };

    const a = migrateCopy(copyA);
    const b = migrateCopy(copyB);

    expect(a).toHaveLength(3);
    for (let i = 0; i < a.length; i += 1) {
      // Zero differences in the envelope change-tracking columns…
      for (const column of ENVELOPE_COLUMNS) {
        expect(a[i]![column]).toEqual(b[i]![column]);
      }
      // …and identical backfilled windows — so no sync traffic is ever needed.
      expect(a[i]!.windows).toEqual(b[i]!.windows);
    }
  });
});
