import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { BackupRow, BackupSheetName, BackupWorkbook } from '@centresoutien/domain';
import { sheetColumnNames, findBackupSheet } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteBackupStore } from '../../src/data/sqlite/repositories/backup-store';
import { ExcelBackupAdapter } from '../../src/data/excel/backup-excel-adapter';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001';
const OTHER_CENTER = 'CS-RABAT-002';

let dir: string;
let db: DB;

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
    const store = new SqliteBackupStore(db, CENTER);
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
      const store2 = new SqliteBackupStore(db2, CENTER);
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
    const store = new SqliteBackupStore(db, CENTER);

    const rooms = await store.readAllRows('rooms');
    expect(rooms).toHaveLength(1);
    expect(rooms[0]!['centerCode']).toBe(CENTER);
  });

  it('refuses to apply a row belonging to another center', async () => {
    const store = new SqliteBackupStore(db, CENTER);
    const otherCenterRoom = await (async () => {
      seedCenterRows(OTHER_CENTER);
      const otherStore = new SqliteBackupStore(db, OTHER_CENTER);
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
    const store = new SqliteBackupStore(db, CENTER);

    const payments = await store.readAllRows('payments');
    // Re-apply the same payment row — the append-only UPDATE trigger must not fire
    // (INSERT … ON CONFLICT DO NOTHING), and a fresh payment still inserts.
    const freshPayment: BackupRow = {
      ...payments[0]!,
      id: 'pay_00000000000000000000000009',
      invoiceId: 'inv_00000000000000000000000002',
    };
    await expect(store.applyRows([{ sheetName: 'payments', rows: [payments[0]!, freshPayment] }])).resolves.toBeUndefined();

    const all = await store.readAllRows('payments');
    expect(all).toHaveLength(2);
    expect(all.find((row) => row['id'] === 'pay_00000000000000000000000009')).toBeDefined();
  });

  it('rolls the whole import back when one row violates a constraint', async () => {
    const store = new SqliteBackupStore(db, CENTER);
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

  it('round-trips a soft-deleted row (tombstone preserved)', async () => {
    seedCenterRows(CENTER);
    db.prepare("UPDATE rooms SET deleted_at = '2026-02-01T10:00:00.000Z' WHERE id = ?").run(`rom_00000000000000000000000001_${CENTER}`);

    const store = new SqliteBackupStore(db, CENTER);
    const rooms = await store.readAllRows('rooms');
    expect(rooms[0]!['deletedAt']).toBe('2026-02-01T10:00:00.000Z');
  });

  it('returns an empty workbook for an empty center', async () => {
    const store = new SqliteBackupStore(db, CENTER);
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
