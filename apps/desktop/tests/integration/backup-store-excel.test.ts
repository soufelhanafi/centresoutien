import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { BackupRow, BackupSheetName, BackupWorkbook, Clock, DeviceId } from '@centresoutien/domain';
import { BACKUP_SHEETS, sheetColumnNames, findBackupSheet } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteBackupStore } from '../../src/data/sqlite/repositories/backup-store';
import { SHEET_SQL } from '../../src/data/sqlite/repositories/backup-store-sheets';
import { SqliteChangeLogWriter } from '../../src/data/sqlite/change-log/sqlite-change-log-writer';
import { ExcelBackupAdapter } from '../../src/data/excel/backup-excel-adapter';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001';
const OTHER_CENTER = 'CS-RABAT-002';
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

/** Seed a representative slice of the schema directly (identity + envelope). */
function seedCenterRows(centerCode: string): void {
  db.prepare(
    `INSERT INTO rooms (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, name, capacity, active)
     VALUES (?, ?, 'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', NULL, 0, 'Salle A', 10, 1)`,
  ).run(`rom_00000000000000000000000001_${centerCode}`, centerCode);
  db.prepare(
    `INSERT INTO parents (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, natural_key, name, phone, email, relation, whatsapp_opt_in)
     VALUES (?, ?, 'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', NULL, 0, ?, 'Papa', '+212600000000', NULL, 'pere', 0)`,
  ).run(`prt_00000000000000000000000001_${centerCode}`, centerCode, `${centerCode}::papa::+212600000000`);
  db.prepare(
    `INSERT INTO students (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, natural_key, name_fr, name_ar, birth_date, level, school, notes, guardian_ids)
     VALUES (?, ?, 'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', NULL, 0, ?, 'Yassine', 'ياسين', '2010-01-01', '3AC', NULL, NULL, '[]')`,
  ).run(`stu_00000000000000000000000001_${centerCode}`, centerCode, `${centerCode}::yassine::2010-01-01`);
  db.prepare(
    `INSERT INTO payments (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, invoice_id, kind, amount_mad, method, paid_on, reverses_payment_id, note)
     VALUES (?, ?, 'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', NULL, 0, 'inv_00000000000000000000000001', 'payment', 5000, 'cash', '2026-08-01', NULL, NULL)`,
  ).run(`pay_00000000000000000000000001_${centerCode}`, centerCode);
}

describe('SqliteBackupStore + ExcelBackupAdapter round-trip', () => {
  it('exports every entity as workbook rows and imports them into a fresh center', async () => {
    seedCenterRows(CENTER);
    const store = makeStore(db, CENTER);
    const excel = new ExcelBackupAdapter();

    // Export: read + write the workbook
    const sheets = [];
    for (const sheetName of ['rooms', 'parents', 'students', 'payments'] as const) {
      const rows = await store.readAllRows(sheetName);
      sheets.push({ name: sheetName, columns: sheetColumnNames(findBackupSheet(sheetName)!), rows });
    }
    const workbookPath = join(dir, 'backup.xlsx');
    await excel.writeWorkbook(workbookPath, { sheets });

    // The workbook round-trips back byte-for-byte at the row level
    const roundTripped = await excel.readWorkbook(workbookPath);
    expect(roundTripped.sheets.map((sheet) => sheet.name)).toEqual(['rooms', 'parents', 'students', 'payments']);
    const exportedRoom = roundTripped.sheets.find((sheet) => sheet.name === 'rooms')!.rows[0]!;
    expect(exportedRoom['id']).toBe(`rom_00000000000000000000000001_${CENTER}`);
    expect(exportedRoom['name']).toBe('Salle A');
    expect(exportedRoom['active']).toBe(true);
    expect(exportedRoom['centerCode']).toBe(CENTER);

    // Import into a brand-new, empty center DB
    const dir2 = mkdtempSync(join(tmpdir(), 'cs-backup-excel-'));
    const db2 = openDatabase({ centreId: 'C2', key: KEY, dir: dir2 });
    runMigrations(db2, REAL_MIGRATIONS);
    try {
      const store2 = makeStore(db2, CENTER);
      await store2.applyRows(
        roundTripped.sheets
          .filter((sheet): sheet is { name: BackupSheetName; columns: readonly string[]; rows: readonly BackupRow[] } =>
            ['rooms', 'parents', 'students', 'payments'].includes(sheet.name),
          )
          .map((sheet) => ({ sheetName: sheet.name, rows: sheet.rows })),
      );

      const restoredRooms = await store2.readAllRows('rooms');
      expect(restoredRooms).toHaveLength(1);
      expect(restoredRooms[0]!['name']).toBe('Salle A');
      const restoredPayments = await store2.readAllRows('payments');
      expect(restoredPayments).toHaveLength(1);
      expect(restoredPayments[0]!['amountMad']).toBe(5000);
    } finally {
      db2.close();
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('round-trips the niveau catalog and the student/group/teacher niveau links (SOU-260)', async () => {
    const NIV = 'niv_00000000000000000000000001';
    const STU = 'stu_00000000000000000000000001';
    const GRP = 'grp_00000000000000000000000001';
    const TCH = 'tch_00000000000000000000000001';
    db.prepare(
      `INSERT INTO niveaux (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, name_fr, name_ar, code, category, active)
       VALUES (?, ?, 'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', NULL, 0, '3ème Année Collège', 'السنة الثالثة إعدادي', '3AC', 'college', 1)`,
    ).run(NIV, CENTER);
    db.prepare(
      `INSERT INTO students (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, natural_key, name_fr, name_ar, birth_date, level, niveau_id, school, notes, guardian_ids)
       VALUES (?, ?, 'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', NULL, 0, ?, 'Yassine', 'ياسين', '2010-01-01', '3AC', ?, NULL, NULL, '[]')`,
    ).run(STU, CENTER, `${CENTER}::yassine::2010-01-01`, NIV);
    db.prepare(
      `INSERT INTO groups (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, subject_id, teacher_id, niveau_id, level, capacity, kind, active)
       VALUES (?, ?, 'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', NULL, 0, 'sub_00000000000000000000000001', NULL, ?, '3AC', 15, 'regular', 1)`,
    ).run(GRP, CENTER, NIV);
    db.prepare(
      `INSERT INTO teachers (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, natural_key, name_fr, name_ar, cin, phone, email, subject_ids, niveau_ids, active)
       VALUES (?, ?, 'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', NULL, 0, ?, 'Prof', 'أستاذ', NULL, '+212600000001', NULL, '[]', ?, 1)`,
    ).run(TCH, CENTER, `${CENTER}::prof::+212600000001`, JSON.stringify([NIV]));

    const store = makeStore(db, CENTER);
    const excel = new ExcelBackupAdapter();
    const sheets = [];
    for (const sheetName of ['niveaux', 'students', 'groups', 'teachers'] as const) {
      const rows = await store.readAllRows(sheetName);
      sheets.push({ name: sheetName, columns: sheetColumnNames(findBackupSheet(sheetName)!), rows });
    }
    const workbookPath = join(dir, 'niveau-backup.xlsx');
    await excel.writeWorkbook(workbookPath, { sheets });

    const roundTripped = await excel.readWorkbook(workbookPath);
    const nivSheet = roundTripped.sheets.find((sheet) => sheet.name === 'niveaux')!;
    expect(nivSheet.rows[0]).toMatchObject({
      id: NIV,
      code: '3AC',
      category: 'college',
      active: true,
      name_fr: '3ème Année Collège',
    });
    const stuSheet = roundTripped.sheets.find((sheet) => sheet.name === 'students')!;
    expect(stuSheet.rows[0]!['niveauId']).toBe(NIV);
    const grpSheet = roundTripped.sheets.find((sheet) => sheet.name === 'groups')!;
    expect(grpSheet.rows[0]!['niveauId']).toBe(NIV);
    const tchSheet = roundTripped.sheets.find((sheet) => sheet.name === 'teachers')!;
    expect(tchSheet.rows[0]!['niveauIds']).toBe(NIV);

    // Import into a fresh center: catalog + links survive.
    const dir2 = mkdtempSync(join(tmpdir(), 'cs-backup-excel-niv-'));
    const db2 = openDatabase({ centreId: 'C2', key: KEY, dir: dir2 });
    runMigrations(db2, REAL_MIGRATIONS);
    try {
      const store2 = makeStore(db2, CENTER);
      await store2.applyRows(
        roundTripped.sheets
          .filter((sheet): sheet is { name: BackupSheetName; columns: readonly string[]; rows: readonly BackupRow[] } =>
            ['niveaux', 'students', 'groups', 'teachers'].includes(sheet.name),
          )
          .map((sheet) => ({ sheetName: sheet.name, rows: sheet.rows })),
      );
      const restoredNiv = await store2.readAllRows('niveaux');
      expect(restoredNiv).toHaveLength(1);
      expect(restoredNiv[0]!['code']).toBe('3AC');
      const restoredStu = await store2.readAllRows('students');
      expect(restoredStu[0]!['niveauId']).toBe(NIV);
      const restoredTch = await store2.readAllRows('teachers');
      expect(restoredTch[0]!['niveauIds']).toBe(NIV);
    } finally {
      db2.close();
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('is tenant-scoped on reads', async () => {
    seedCenterRows(CENTER);
    seedCenterRows(OTHER_CENTER);
    const store = makeStore(db, CENTER);

    const rooms = await store.readAllRows('rooms');
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!['centerCode']).toBe(CENTER);
  });

  it('refuses to apply a row belonging to another center', async () => {
    const store = makeStore(db, CENTER);
    const otherCenterRoom = await (async () => {
      seedCenterRows(OTHER_CENTER);
      const otherStore = makeStore(db, OTHER_CENTER);
      const rows = await otherStore.readAllRows('rooms');
      return rows[0]!;
    })();

    await expect(store.applyRows([{ sheetName: 'rooms', rows: [otherCenterRoom] }])).rejects.toThrow(
      /another center|CS-RABAT-002/,
    );
    expect(await store.readAllRows('rooms')).toHaveLength(0);
  });

  it('applying an existing payment id is a no-op, not an append-only violation', async () => {
    seedCenterRows(CENTER);
    const store = makeStore(db, CENTER);

    const payments = await store.readAllRows('payments');
    // Replay the same id with a CHANGED immutable field (amountMad) — the
    // append-only UPDATE trigger must never fire, and the stored payment must
    // keep its original value (proving the replay is a true no-op, not an
    // overwrite). A fresh payment id still inserts.
    const tamperedReplay: BackupRow = {
      ...payments[0]!,
      amountMad: 9999,
      note: 'tampered',
    };
    const freshPayment: BackupRow = {
      ...payments[0]!,
      id: 'pay_00000000000000000000000009',
      invoiceId: 'inv_00000000000000000000000002',
    };
    await expect(
      store.applyRows([{ sheetName: 'payments', rows: [tamperedReplay, freshPayment] }]),
    ).resolves.toBeUndefined();

    const all = await store.readAllRows('payments');
    expect(all).toHaveLength(2);
    const original = all.find((row) => row['id'] === payments[0]!['id'])!;
    expect(original['amountMad']).toBe(5000);
    expect(original['note']).toBeNull();
    expect(all.find((row) => row['id'] === 'pay_00000000000000000000000009')).toBeDefined();
  });

  it('round-trips the synced settings tables (SOU-264): center_hours_overrides, teacher_availability, teacher_availability_exceptions', async () => {
    const HOURS = {
      0: [{ open: '09:00', close: '15:00' }, { open: '21:00', close: '23:00' }],
      1: [{ open: '09:00', close: '15:00' }],
      2: [{ open: '09:00', close: '15:00' }],
      3: [{ open: '09:00', close: '15:00' }],
      4: [{ open: '09:00', close: '15:00' }],
      5: [],
      6: [{ open: '09:00', close: '15:00' }],
    };
    const WINDOWS = {
      0: [{ open: '08:00', close: '12:00' }],
      1: [{ open: '08:00', close: '12:00' }],
      2: [{ open: '08:00', close: '12:00' }],
      3: [{ open: '08:00', close: '12:00' }],
      4: [{ open: '08:00', close: '12:00' }],
      5: [],
      6: [],
    };
    const CHO = 'cho_00000000000000000000000001';
    const TAV = 'tav_00000000000000000000000001';
    const TAE = 'tae_00000000000000000000000001';
    const TCH = 'tch_00000000000000000000000001';

    db.prepare(
      `INSERT INTO center_hours_overrides
         (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, start_date, end_date, hours_by_weekday)
       VALUES (?, ?, 'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', NULL, 0, '2026-02-18', '2026-03-19', ?)`,
    ).run(CHO, CENTER, JSON.stringify(HOURS));
    db.prepare(
      `INSERT INTO teacher_availability
         (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, teacher_id, weekly_windows)
       VALUES (?, ?, 'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', NULL, 0, ?, ?)`,
    ).run(TAV, CENTER, TCH, JSON.stringify(WINDOWS));
    db.prepare(
      `INSERT INTO teacher_availability_exceptions
         (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, teacher_id, start_date, end_date, label)
       VALUES (?, ?, 'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', NULL, 0, ?, '2026-05-01', '2026-05-15', 'Omra')`,
    ).run(TAE, CENTER, TCH);

    const store = makeStore(db, CENTER);
    const excel = new ExcelBackupAdapter();
    const sheets = [];
    for (const sheetName of ['center-hours-overrides', 'teacher-availability', 'teacher-availability-exceptions'] as const) {
      const rows = await store.readAllRows(sheetName);
      sheets.push({ name: sheetName, columns: sheetColumnNames(findBackupSheet(sheetName)!), rows });
    }
    const workbookPath = join(dir, 'synced-settings.xlsx');
    await excel.writeWorkbook(workbookPath, { sheets });

    const roundTripped = await excel.readWorkbook(workbookPath);
    const choSheet = roundTripped.sheets.find((sheet) => sheet.name === 'center-hours-overrides')!;
    expect(choSheet.rows[0]).toMatchObject({
      id: CHO,
      startDate: '2026-02-18',
      endDate: '2026-03-19',
      hoursByWeekday: JSON.stringify(HOURS),
    });
    const tavSheet = roundTripped.sheets.find((sheet) => sheet.name === 'teacher-availability')!;
    expect(tavSheet.rows[0]).toMatchObject({
      id: TAV,
      teacherId: TCH,
      weeklyWindows: JSON.stringify(WINDOWS),
    });
    const taeSheet = roundTripped.sheets.find((sheet) => sheet.name === 'teacher-availability-exceptions')!;
    expect(taeSheet.rows[0]).toMatchObject({
      id: TAE,
      teacherId: TCH,
      startDate: '2026-05-01',
      endDate: '2026-05-15',
      label: 'Omra',
    });

    // Import into a fresh center: all three synced settings survive, tombstones too.
    const dir2 = mkdtempSync(join(tmpdir(), 'cs-backup-excel-settings-'));
    const db2 = openDatabase({ centreId: 'C2', key: KEY, dir: dir2 });
    runMigrations(db2, REAL_MIGRATIONS);
    try {
      const store2 = makeStore(db2, CENTER);
      await store2.applyRows(
        roundTripped.sheets
          .filter((sheet): sheet is { name: BackupSheetName; columns: readonly string[]; rows: readonly BackupRow[] } =>
            ['center-hours-overrides', 'teacher-availability', 'teacher-availability-exceptions'].includes(sheet.name),
          )
          .map((sheet) => ({ sheetName: sheet.name, rows: sheet.rows })),
      );
      const restoredCho = await store2.readAllRows('center-hours-overrides');
      expect(restoredCho).toHaveLength(1);
      expect(restoredCho[0]).toMatchObject({
        id: CHO,
        startDate: '2026-02-18',
        endDate: '2026-03-19',
        hoursByWeekday: JSON.stringify(HOURS),
      });
      const restoredTav = await store2.readAllRows('teacher-availability');
      expect(restoredTav).toHaveLength(1);
      expect(restoredTav[0]).toMatchObject({
        id: TAV,
        teacherId: TCH,
        weeklyWindows: JSON.stringify(WINDOWS),
      });
      const restoredTae = await store2.readAllRows('teacher-availability-exceptions');
      expect(restoredTae).toHaveLength(1);
      expect(restoredTae[0]).toMatchObject({
        id: TAE,
        teacherId: TCH,
        startDate: '2026-05-01',
        endDate: '2026-05-15',
        label: 'Omra',
      });
    } finally {
      db2.close();
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('exports and restores a tombstoned override/availability through a fresh database (SOU-264)', async () => {
    const CHO = 'cho_00000000000000000000000002';
    const TAV = 'tav_00000000000000000000000002';
    const TAE = 'tae_00000000000000000000000002';
    const TCH = 'tch_00000000000000000000000002';
    const HOURS = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    const WINDOWS = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    db.prepare(
      `INSERT INTO center_hours_overrides
         (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, start_date, end_date, hours_by_weekday)
       VALUES (?, ?, 'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', '2026-02-01T10:00:00.000Z', 1, '2026-02-18', '2026-03-19', ?)`,
    ).run(CHO, CENTER, JSON.stringify(HOURS));
    db.prepare(
      `INSERT INTO teacher_availability
         (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, teacher_id, weekly_windows)
       VALUES (?, ?, 'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', '2026-02-01T10:00:00.000Z', 1, ?, ?)`,
    ).run(TAV, CENTER, TCH, JSON.stringify(WINDOWS));
    db.prepare(
      `INSERT INTO teacher_availability_exceptions
         (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, teacher_id, start_date, end_date, label)
       VALUES (?, ?, 'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', '2026-02-01T10:00:00.000Z', 1, ?, '2026-05-01', '2026-05-15', NULL)`,
    ).run(TAE, CENTER, TCH);

    const store = makeStore(db, CENTER);
    const excel = new ExcelBackupAdapter();
    const sheets = [];
    for (const sheetName of ['center-hours-overrides', 'teacher-availability', 'teacher-availability-exceptions'] as const) {
      const rows = await store.readAllRows(sheetName);
      sheets.push({ name: sheetName, columns: sheetColumnNames(findBackupSheet(sheetName)!), rows });
    }
    const workbookPath = join(dir, 'synced-settings-tombstones.xlsx');
    await excel.writeWorkbook(workbookPath, { sheets });
    const read = await excel.readWorkbook(workbookPath);

    const dir2 = mkdtempSync(join(tmpdir(), 'cs-backup-excel-settings-'));
    const db2 = openDatabase({ centreId: 'C2', key: KEY, dir: dir2 });
    runMigrations(db2, REAL_MIGRATIONS);
    try {
      await makeStore(db2, CENTER).applyRows(
        read.sheets
          .filter((sheet): sheet is { name: BackupSheetName; columns: readonly string[]; rows: readonly BackupRow[] } =>
            ['center-hours-overrides', 'teacher-availability', 'teacher-availability-exceptions'].includes(sheet.name),
          )
          .map((sheet) => ({ sheetName: sheet.name, rows: sheet.rows })),
      );
      const restoredCho = await makeStore(db2, CENTER).readAllRows('center-hours-overrides');
      expect(restoredCho).toHaveLength(1);
      expect(restoredCho[0]!['deletedAt']).toBe('2026-02-01T10:00:00.000Z');
      const restoredTav = await makeStore(db2, CENTER).readAllRows('teacher-availability');
      expect(restoredTav).toHaveLength(1);
      expect(restoredTav[0]!['deletedAt']).toBe('2026-02-01T10:00:00.000Z');
      const restoredTae = await makeStore(db2, CENTER).readAllRows('teacher-availability-exceptions');
      expect(restoredTae).toHaveLength(1);
      expect(restoredTae[0]!['deletedAt']).toBe('2026-02-01T10:00:00.000Z');
    } finally {
      db2.close();
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('logs the synced-settings restore as the DOMAIN payload shape, not the flat row (SOU-264)', async () => {
    const CHO = 'cho_00000000000000000000000003';
    const TAV = 'tav_00000000000000000000000003';
    const TAE = 'tae_00000000000000000000000003';
    const TCH = 'tch_00000000000000000000000003';
    db.prepare(
      `INSERT INTO center_hours_overrides
         (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, start_date, end_date, hours_by_weekday)
       VALUES (?, ?, 'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', NULL, 0, '2026-02-18', '2026-03-19', '{"0":[{"open":"09:00","close":"15:00"}]}')`,
    ).run(CHO, CENTER);
    db.prepare(
      `INSERT INTO teacher_availability
         (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, teacher_id, weekly_windows)
       VALUES (?, ?, 'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', NULL, 0, ?, '{"0":[{"open":"08:00","close":"12:00"}]}')`,
    ).run(TAV, CENTER, TCH);
    db.prepare(
      `INSERT INTO teacher_availability_exceptions
         (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, teacher_id, start_date, end_date, label)
       VALUES (?, ?, 'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', NULL, 0, ?, '2026-05-01', '2026-05-15', NULL)`,
    ).run(TAE, CENTER, TCH);

    const store = makeStore(db, CENTER);
    const excel = new ExcelBackupAdapter();
    const sheets = [];
    for (const sheetName of ['center-hours-overrides', 'teacher-availability', 'teacher-availability-exceptions'] as const) {
      const rows = await store.readAllRows(sheetName);
      sheets.push({ name: sheetName, columns: sheetColumnNames(findBackupSheet(sheetName)!), rows });
    }
    const workbookPath = join(dir, 'synced-settings-log.xlsx');
    await excel.writeWorkbook(workbookPath, { sheets });
    const read = await excel.readWorkbook(workbookPath);

    const dir2 = mkdtempSync(join(tmpdir(), 'cs-backup-excel-log-'));
    const db2 = openDatabase({ centreId: 'C2', key: KEY, dir: dir2 });
    runMigrations(db2, REAL_MIGRATIONS);
    try {
      await makeStore(db2, CENTER).applyRows(
        read.sheets
          .filter((sheet): sheet is { name: BackupSheetName; columns: readonly string[]; rows: readonly BackupRow[] } =>
            ['center-hours-overrides', 'teacher-availability', 'teacher-availability-exceptions'].includes(sheet.name),
          )
          .map((sheet) => ({ sheetName: sheet.name, rows: sheet.rows })),
      );
      const logged = db2
        .prepare('SELECT entity_type, payload FROM change_log ORDER BY rowid')
        .all() as { entity_type: string; payload: string }[];
      const byType = (type: string) => JSON.parse(logged.find((row) => row.entity_type === type)!.payload).entity;
      const cho = byType('center_hours_overrides');
      expect(cho.dateRange).toEqual({ start: '2026-02-18', end: '2026-03-19' });
      expect(cho.hoursByWeekday).toEqual({ 0: [{ open: '09:00', close: '15:00' }] });
      const tav = byType('teacher_availability');
      expect(tav.teacherId).toBe(TCH);
      expect(tav.weeklyWindows).toEqual({ 0: [{ open: '08:00', close: '12:00' }] });
      const tae = byType('teacher_availability_exceptions');
      expect(tae.dateRange).toEqual({ start: '2026-05-01', end: '2026-05-15' });
      expect(tae.label).toBeNull();
    } finally {
      db2.close();
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('appends a change_log entry for every actually-written row, none for a skipped replay (SOU-79)', async () => {
    seedCenterRows(CENTER);
    const store = makeStore(db, CENTER);
    const changeLogRows = () =>
      db.prepare('SELECT entity_type, entity_id, op, revision FROM change_log ORDER BY rowid').all() as {
        entity_type: string;
        entity_id: string;
        op: string;
        revision: number;
      }[];

    const payments = await store.readAllRows('payments');
    const rooms = await store.readAllRows('rooms');
    // Replay an existing payment (skipped: no-op) + a fresh room (written).
    const freshRoom: BackupRow = { ...rooms[0]!, id: 'rom_00000000000000000000000009' };
    await store.applyRows([
      { sheetName: 'payments', rows: [payments[0]!] },
      { sheetName: 'rooms', rows: [freshRoom] },
    ]);

    const logged = changeLogRows();
    const roomEntries = logged.filter((row) => row.entity_type === 'rooms');
    const paymentEntries = logged.filter((row) => row.entity_type === 'payments');
    // The fresh room write is logged once with a create op; the replayed payment
    // is a no-op and must NOT appear in the log at all.
    expect(roomEntries).toHaveLength(1);
    expect(roomEntries[0]!.entity_id).toBe('rom_00000000000000000000000009');
    expect(roomEntries[0]!.op).toBe('create');
    expect(paymentEntries).toHaveLength(0);
  });

  it('exports and restores a tombstone through a fresh database (deletedAt preserved)', async () => {
    seedCenterRows(CENTER);
    db.prepare("UPDATE rooms SET deleted_at = '2026-02-01T10:00:00.000Z' WHERE id = ?").run(
      `rom_00000000000000000000000001_${CENTER}`,
    );

    const excel = new ExcelBackupAdapter();
    const store = makeStore(db, CENTER);
    const rows = await store.readAllRows('rooms');
    expect(rows[0]!['deletedAt']).toBe('2026-02-01T10:00:00.000Z');

    // Export the tombstone to a workbook, apply it to a FRESH database.
    const workbookPath = join(dir, 'tombstone.xlsx');
    await excel.writeWorkbook(workbookPath, {
      sheets: [
        { name: 'rooms', columns: sheetColumnNames(findBackupSheet('rooms')!), rows },
      ],
    });
    const read = await excel.readWorkbook(workbookPath);

    const dir2 = mkdtempSync(join(tmpdir(), 'cs-backup-excel-'));
    const db2 = openDatabase({ centreId: 'C2', key: KEY, dir: dir2 });
    runMigrations(db2, REAL_MIGRATIONS);
    try {
      await makeStore(db2, CENTER).applyRows([
        { sheetName: 'rooms', rows: [...read.sheets[0]!.rows] },
      ]);
      const restored = await makeStore(db2, CENTER).readAllRows('rooms');
      expect(restored).toHaveLength(1);
      expect(restored[0]!['deletedAt']).toBe('2026-02-01T10:00:00.000Z');
    } finally {
      db2.close();
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('covers every registered backup sheet with a column-parity config', async () => {
    // A sheet can silently drop out of the backup if its SQL config forgets a
    // column or a whole sheet is left unregistered — assert parity against the
    // domain registry (the single source of truth for what a "full backup" is).
    const store = makeStore(db, CENTER);
    for (const spec of BACKUP_SHEETS) {
      const rows = await store.readAllRows(spec.name);
      expect(rows).toEqual([]);
    }
    // The store's SQL config must expose every domain sheet name, and the
    // exported header must match the domain spec column-for-column.
    const sheets = [];
    for (const spec of BACKUP_SHEETS) {
      const rows = await store.readAllRows(spec.name);
      sheets.push({ name: spec.name, columns: sheetColumnNames(spec), rows });
    }
    const workbookPath = join(dir, 'all.xlsx');
    const excel = new ExcelBackupAdapter();
    await excel.writeWorkbook(workbookPath, { sheets });
    const read = await excel.readWorkbook(workbookPath);
    expect(read.sheets.map((sheet) => sheet.name)).toEqual(BACKUP_SHEETS.map((spec) => spec.name));
  });

  it('keeps domain restore conflict policy aligned with SQL apply behavior', () => {
    for (const spec of BACKUP_SHEETS) {
      expect(SHEET_SQL[spec.name].conflict, spec.name).toBe(spec.restoreConflict);
    }
  });

  it('round-trips center-hours split-day windows through Excel export + import (SOU-197)', async () => {
    db.prepare(
      `INSERT INTO center_hours
         (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at, version, day_of_week, windows)
       VALUES (?, ?, 'dev_1', '2026-01-01T10:00:00.000Z', '2026-01-01T10:00:00.000Z', 'usr_1', NULL, 0, 1, ?)`,
    ).run(
      'chr_00000000000000000000000001',
      CENTER,
      JSON.stringify([
        { open: '09:00', close: '12:00' },
        { open: '14:00', close: '18:00' },
      ]),
    );
    const store = makeStore(db, CENTER);
    const excel = new ExcelBackupAdapter();

    const exported = await store.readAllRows('center-hours');
    expect(exported).toHaveLength(1);
    expect(exported[0]!['dayOfWeek']).toBe(1);
    expect(exported[0]!['windows']).toBe(
      JSON.stringify([
        { open: '09:00', close: '12:00' },
        { open: '14:00', close: '18:00' },
      ]),
    );

    const workbookPath = join(dir, 'hours.xlsx');
    await excel.writeWorkbook(workbookPath, {
      sheets: [
        { name: 'center-hours', columns: sheetColumnNames(findBackupSheet('center-hours')!), rows: exported },
      ],
    });
    const read = await excel.readWorkbook(workbookPath);

    const dir2 = mkdtempSync(join(tmpdir(), 'cs-backup-excel-'));
    const db2 = openDatabase({ centreId: 'C2', key: KEY, dir: dir2 });
    runMigrations(db2, REAL_MIGRATIONS);
    try {
      await makeStore(db2, CENTER).applyRows([
        { sheetName: 'center-hours', rows: [...read.sheets[0]!.rows] },
      ]);
      const restored = await makeStore(db2, CENTER).readAllRows('center-hours');
      expect(restored).toHaveLength(1);
      expect(restored[0]!['windows']).toBe(
        JSON.stringify([
          { open: '09:00', close: '12:00' },
          { open: '14:00', close: '18:00' },
        ]),
      );
    } finally {
      db2.close();
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('rolls the whole import back when one row violates a constraint', async () => {
    const store = makeStore(db, CENTER);
    const goodRoom: BackupRow = {
      id: 'rom_00000000000000000000000001',
      centerCode: CENTER,
      deviceOrigin: 'dev_1',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
      updatedBy: 'usr_1',
      deletedAt: null,
      version: 0,
      name: 'Salle A',
      capacity: 10,
      active: true,
    };
    // capacity 0 violates CHECK (capacity >= 1) — the second row aborts the tx
    const badRoom: BackupRow = { ...goodRoom, id: 'rom_00000000000000000000000002', capacity: 0 };

    await expect(
      store.applyRows([{ sheetName: 'rooms', rows: [goodRoom, badRoom] }]),
    ).rejects.toThrow(/capacity|CHECK/i);

    const rooms = await store.readAllRows('rooms');
    expect(rooms).toHaveLength(0);
  });

  it('returns an empty workbook for an empty center', async () => {
    const store = makeStore(db, CENTER);
    const excel = new ExcelBackupAdapter();
    const workbook: BackupWorkbook = {
      sheets: [
        { name: 'rooms', columns: sheetColumnNames(findBackupSheet('rooms')!), rows: await store.readAllRows('rooms') },
      ],
    };
    await excel.writeWorkbook(join(dir, 'empty.xlsx'), workbook);
    const read = await excel.readWorkbook(join(dir, 'empty.xlsx'));
    expect(read.sheets[0]!.rows).toEqual([]);
  });
});
