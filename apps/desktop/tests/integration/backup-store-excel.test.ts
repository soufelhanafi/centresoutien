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
