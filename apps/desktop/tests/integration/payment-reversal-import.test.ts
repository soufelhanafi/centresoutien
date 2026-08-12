import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type { BackupRow, BackupSheetWrite, Clock, DeviceId } from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteBackupStore } from '../../src/data/sqlite/repositories/backup-store';
import { SqliteChangeLogWriter } from '../../src/data/sqlite/change-log/sqlite-change-log-writer';
import {
  ensurePaymentReversalUniqueIndex,
  REVERSAL_ONCE_INDEX,
} from '../../src/data/sqlite/repairs/payment-reversal-index';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001';
const DEVICE = 'dev_test' as DeviceId;
const CLOCK: Clock = { now: () => new Date('2026-08-10T10:00:00.000Z') };
const INVOICE = 'inv_00000000000000000000000001';
const PAYMENT = 'pay_00000000000000000000000001';

let dir: string;
let db: DB;
let store: SqliteBackupStore;

function paymentRow(over: Partial<BackupRow> & { id: string }): BackupRow {
  return {
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: '2026-08-10T10:00:00.000Z',
    updatedAt: '2026-08-10T10:00:00.000Z',
    updatedBy: 'usr_1',
    deletedAt: null,
    version: 0,
    invoiceId: INVOICE,
    kind: 'payment',
    amountMad: 35000,
    method: 'cash',
    paidOn: '2026-08-10',
    reversesPaymentId: null,
    note: null,
    ...over,
  };
}

function paymentsSheet(rows: readonly BackupRow[]): BackupSheetWrite {
  return { sheetName: 'payments', rows };
}

function indexExists(name: string): boolean {
  return (
    db.prepare(`SELECT 1 FROM sqlite_master WHERE type='index' AND name = ?`).get(name) !== undefined
  );
}

function liveRowCount(): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM payments WHERE invoice_id = ?`).get(INVOICE) as { n: number }).n;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-pay-import-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  // Clean DB → the unique backstop index is present before the import.
  ensurePaymentReversalUniqueIndex(db);
  store = new SqliteBackupStore(db, CENTER, new SqliteChangeLogWriter(db, CLOCK, DEVICE));
});

afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('workbook import with a legacy double-void (SOU-233 #7)', () => {
  it('imports a two-reversal workbook without rolling back; both rows retained, index skipped and reported', async () => {
    await expect(
      store.applyRows([
        paymentsSheet([
          paymentRow({ id: PAYMENT, kind: 'payment', amountMad: 35000, reversesPaymentId: null }),
          paymentRow({ id: 'pay_00000000000000000000000010', kind: 'reversal', amountMad: 35000, reversesPaymentId: PAYMENT }),
          paymentRow({ id: 'pay_00000000000000000000000011', kind: 'reversal', amountMad: 35000, reversesPaymentId: PAYMENT }),
        ]),
      ]),
    ).resolves.toBeUndefined();

    // Both append-only reversal rows are retained (the whole restore did NOT roll back).
    expect(liveRowCount()).toBe(3);
    // The import introduced a double-void, so the unique backstop is skipped and reported.
    expect(indexExists(REVERSAL_ONCE_INDEX)).toBe(false);
    expect(ensurePaymentReversalUniqueIndex(db).pendingDoubleVoids).toEqual([PAYMENT]);
  });

  it('recreates the unique index on a clean import (single reversal)', async () => {
    await store.applyRows([
      paymentsSheet([
        paymentRow({ id: PAYMENT, kind: 'payment', amountMad: 35000, reversesPaymentId: null }),
        paymentRow({ id: 'pay_00000000000000000000000010', kind: 'reversal', amountMad: 35000, reversesPaymentId: PAYMENT }),
      ]),
    ]);
    expect(liveRowCount()).toBe(2);
    expect(indexExists(REVERSAL_ONCE_INDEX)).toBe(true);
  });
});
