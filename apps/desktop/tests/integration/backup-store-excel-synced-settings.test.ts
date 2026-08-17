import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { BackupRow, BackupSheetName, Clock, DeviceId } from '@centresoutien/domain';
import { sheetColumnNames, findBackupSheet } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteBackupStore } from '../../src/data/sqlite/repositories/backup-store';
import { SqliteChangeLogWriter } from '../../src/data/sqlite/change-log/sqlite-change-log-writer';
import { ExcelBackupAdapter } from '../../src/data/excel/backup-excel-adapter';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001';
const DEVICE = 'dev_test' as DeviceId;
const TEST_CLOCK: Clock = { now: () => new Date('2026-08-01T10:00:00.000Z') };

let dir: string;
let db: DB;

function makeStore(db: DB, centerCode: string): SqliteBackupStore {
  return new SqliteBackupStore(db, centerCode, new SqliteChangeLogWriter(db, TEST_CLOCK, DEVICE));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-backup-excel-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const SYNCED_SETTING_SHEETS = [
  'center-hours-overrides',
  'teacher-availability',
  'teacher-availability-exceptions',
] as const;

const EMPTY_WEEK = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };

type SyncedSettingsFixture = {
  cho: string;
  tav: string;
  tae: string;
  tch: string;
  hoursByWeekday: string;
  weeklyWindows: string;
  label: string | null;
  deletedAt: string | null;
};

function seedSyncedSettings(db: DB, centerCode: string, fixture: SyncedSettingsFixture): void {
  const deletedAt = fixture.deletedAt === null ? 'NULL' : `'${fixture.deletedAt}'`;
  const version = fixture.deletedAt === null ? 0 : 1;
  db.prepare(
    `INSERT INTO center_hours_overrides
       (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, start_date, end_date, hours_by_weekday)
     VALUES (?, ?, 'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', ${deletedAt}, ${version}, '2026-02-18', '2026-03-19', ?)`,
  ).run(fixture.cho, centerCode, fixture.hoursByWeekday);
  db.prepare(
    `INSERT INTO teacher_availability
       (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, teacher_id, weekly_windows)
     VALUES (?, ?, 'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', ${deletedAt}, ${version}, ?, ?)`,
  ).run(fixture.tav, centerCode, fixture.tch, fixture.weeklyWindows);
  db.prepare(
    `INSERT INTO teacher_availability_exceptions
       (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, teacher_id, start_date, end_date, label)
     VALUES (?, ?, 'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', ${deletedAt}, ${version}, ?, '2026-05-01', '2026-05-15', ?)`,
  ).run(fixture.tae, centerCode, fixture.tch, fixture.label);
}

async function exportSyncedSettingsWorkbook(
  store: SqliteBackupStore,
  excel: ExcelBackupAdapter,
): Promise<ReturnType<typeof excel.readWorkbook>> {
  const sheets = [];
  for (const sheetName of SYNCED_SETTING_SHEETS) {
    const rows = await store.readAllRows(sheetName);
    sheets.push({ name: sheetName, columns: sheetColumnNames(findBackupSheet(sheetName)!), rows });
  }
  await excel.writeWorkbook(join(dir, 'synced-settings.xlsx'), { sheets });
  return excel.readWorkbook(join(dir, 'synced-settings.xlsx'));
}

function syncedSettingsSheetWrites(
  workbook: { sheets: readonly { name: string; rows: readonly BackupRow[] }[] },
): { sheetName: BackupSheetName; rows: readonly BackupRow[] }[] {
  return workbook.sheets
    .filter((sheet): sheet is { name: BackupSheetName; columns: readonly string[]; rows: readonly BackupRow[] } =>
      (SYNCED_SETTING_SHEETS as readonly string[]).includes(sheet.name),
    )
    .map((sheet) => ({ sheetName: sheet.name, rows: sheet.rows }));
}

async function withFreshDb(fn: (freshDb: DB) => Promise<void>): Promise<void> {
  const freshDir = mkdtempSync(join(tmpdir(), 'cs-backup-excel-settings-'));
  const freshDb = openDatabase({ centreId: 'C2', key: KEY, dir: freshDir });
  runMigrations(freshDb, REAL_MIGRATIONS);
  try {
    await fn(freshDb);
  } finally {
    freshDb.close();
    rmSync(freshDir, { recursive: true, force: true });
  }
}

describe('SqliteBackupStore + ExcelBackupAdapter synced-settings round-trip (SOU-264)', () => {
  it('round-trips the synced settings tables: center_hours_overrides, teacher_availability, teacher_availability_exceptions', async () => {
    const HOURS = { ...EMPTY_WEEK, 0: [{ open: '09:00', close: '15:00' }, { open: '21:00', close: '23:00' }] };
    const WINDOWS = { ...EMPTY_WEEK, 0: [{ open: '08:00', close: '12:00' }] };
    const TCH = 'tch_00000000000000000000000001';
    seedSyncedSettings(db, CENTER, {
      cho: 'cho_00000000000000000000000001',
      tav: 'tav_00000000000000000000000001',
      tae: 'tae_00000000000000000000000001',
      tch: TCH,
      hoursByWeekday: JSON.stringify(HOURS),
      weeklyWindows: JSON.stringify(WINDOWS),
      label: 'Omra',
      deletedAt: null,
    });

    const workbook = await exportSyncedSettingsWorkbook(makeStore(db, CENTER), new ExcelBackupAdapter());
    expect(workbook.sheets.find((sheet) => sheet.name === 'center-hours-overrides')!.rows[0]).toMatchObject({
      id: 'cho_00000000000000000000000001',
      startDate: '2026-02-18',
      endDate: '2026-03-19',
      hoursByWeekday: JSON.stringify(HOURS),
    });
    expect(workbook.sheets.find((sheet) => sheet.name === 'teacher-availability')!.rows[0]).toMatchObject({
      teacherId: TCH,
      weeklyWindows: JSON.stringify(WINDOWS),
    });
    expect(
      workbook.sheets.find((sheet) => sheet.name === 'teacher-availability-exceptions')!.rows[0],
    ).toMatchObject({ teacherId: TCH, startDate: '2026-05-01', endDate: '2026-05-15', label: 'Omra' });

    await withFreshDb(async (db2) => {
      await makeStore(db2, CENTER).applyRows(syncedSettingsSheetWrites(workbook));
      expect(await makeStore(db2, CENTER).readAllRows('center-hours-overrides')).toMatchObject([
        { hoursByWeekday: JSON.stringify(HOURS) },
      ]);
      expect(await makeStore(db2, CENTER).readAllRows('teacher-availability')).toMatchObject([
        { teacherId: TCH, weeklyWindows: JSON.stringify(WINDOWS) },
      ]);
      expect(await makeStore(db2, CENTER).readAllRows('teacher-availability-exceptions')).toMatchObject([
        { teacherId: TCH, startDate: '2026-05-01', endDate: '2026-05-15', label: 'Omra' },
      ]);
    });
  });

  it('exports and restores a tombstoned override/availability through a fresh database', async () => {
    const TCH = 'tch_00000000000000000000000002';
    seedSyncedSettings(db, CENTER, {
      cho: 'cho_00000000000000000000000002',
      tav: 'tav_00000000000000000000000002',
      tae: 'tae_00000000000000000000000002',
      tch: TCH,
      hoursByWeekday: JSON.stringify(EMPTY_WEEK),
      weeklyWindows: JSON.stringify(EMPTY_WEEK),
      label: null,
      deletedAt: '2026-02-01T10:00:00.000Z',
    });

    const workbook = await exportSyncedSettingsWorkbook(makeStore(db, CENTER), new ExcelBackupAdapter());
    expect(
      workbook.sheets.find((sheet) => sheet.name === 'center-hours-overrides')!.rows[0]!['deletedAt'],
    ).toBe('2026-02-01T10:00:00.000Z');

    await withFreshDb(async (db2) => {
      await makeStore(db2, CENTER).applyRows(syncedSettingsSheetWrites(workbook));
      for (const sheetName of SYNCED_SETTING_SHEETS) {
        const restored = await makeStore(db2, CENTER).readAllRows(sheetName);
        expect(restored).toHaveLength(1);
        expect(restored[0]!['deletedAt']).toBe('2026-02-01T10:00:00.000Z');
      }
    });
  });

  it('logs the synced-settings restore as the DOMAIN payload shape, not the flat row', async () => {
    const TCH = 'tch_00000000000000000000000003';
    const HOURS = { ...EMPTY_WEEK, 0: [{ open: '09:00', close: '15:00' }] };
    const WINDOWS = { ...EMPTY_WEEK, 0: [{ open: '08:00', close: '12:00' }] };
    seedSyncedSettings(db, CENTER, {
      cho: 'cho_00000000000000000000000003',
      tav: 'tav_00000000000000000000000003',
      tae: 'tae_00000000000000000000000003',
      tch: TCH,
      hoursByWeekday: JSON.stringify(HOURS),
      weeklyWindows: JSON.stringify(WINDOWS),
      label: null,
      deletedAt: null,
    });

    const workbook = await exportSyncedSettingsWorkbook(makeStore(db, CENTER), new ExcelBackupAdapter());
    await withFreshDb(async (db2) => {
      await makeStore(db2, CENTER).applyRows(syncedSettingsSheetWrites(workbook));
      const logged = db2
        .prepare('SELECT entity_type, payload FROM change_log ORDER BY rowid')
        .all() as { entity_type: string; payload: string }[];
      const byType = (type: string) => JSON.parse(logged.find((row) => row.entity_type === type)!.payload).entity;
      const cho = byType('center_hours_overrides');
      expect(cho.dateRange).toEqual({ start: '2026-02-18', end: '2026-03-19' });
      expect(cho.hoursByWeekday).toEqual(HOURS);
      const tav = byType('teacher_availability');
      expect(tav.teacherId).toBe(TCH);
      expect(tav.weeklyWindows).toEqual(WINDOWS);
      const tae = byType('teacher_availability_exceptions');
      expect(tae.dateRange).toEqual({ start: '2026-05-01', end: '2026-05-15' });
      expect(tae.label).toBeNull();
    });
  });
});
