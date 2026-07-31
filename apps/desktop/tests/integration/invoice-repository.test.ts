import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  Invoice,
  InvoiceId,
  InvoiceLine,
  InvoiceLineId,
  InvoiceStatus,
  CenterCode,
  DeviceId,
  StudentId,
  UserId,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import {
  loadMigrations,
  applyMigrations,
  runMigrations,
} from '../../src/data/sqlite/migration-runner';
import { SqliteInvoiceRepository } from '../../src/data/sqlite/repositories/invoice-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const USER = 'usr_00000000000000000000000001' as UserId;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const STUDENT_A = 'stu_00000000000000000000000001' as StudentId;
const STUDENT_B = 'stu_00000000000000000000000002' as StudentId;
const INVOICE_A = 'inv_00000000000000000000000001' as InvoiceId;

let dir: string;
let db: DB;
let repo: SqliteInvoiceRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-inv-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteInvoiceRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-07-31T10:00:00Z');

function makeInvoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: INVOICE_A,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    studentId: STUDENT_A,
    month: '2026-09',
    status: 'draft',
    issuedAt: null,
    cancelledAt: null,
    ...over,
  };
}

let lineSeq = 0;
function makeLine(invoiceId: InvoiceId, over: Partial<InvoiceLine> = {}): InvoiceLine {
  lineSeq += 1;
  return {
    id: `invl_${String(lineSeq).padStart(26, '0')}` as InvoiceLineId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    invoiceId,
    formulaId: 'for_00000000000000000000000009',
    label: { fr: 'Math + Physique', ar: 'رياضيات وفيزياء' },
    kind: 'regular',
    amountMad: 35000,
    ...over,
  };
}

describe('SqliteInvoiceRepository', () => {
  it('round-trips an invoice header through save + findById with all fields intact', async () => {
    const invoice = makeInvoice({
      status: 'issued',
      issuedAt: new Date('2026-08-01T09:00:00Z'),
      version: 4,
    });
    await repo.save(invoice);
    expect(await repo.findById(invoice.id)).toEqual(invoice);
  });

  it('round-trips null issuedAt / cancelledAt (a fresh draft)', async () => {
    await repo.save(makeInvoice());
    const found = await repo.findById(INVOICE_A);
    expect(found?.issuedAt).toBeNull();
    expect(found?.cancelledAt).toBeNull();
    expect(found?.status).toBe('draft');
  });

  it('findById returns null for an unknown id', async () => {
    expect(await repo.findById('inv_00000000000000000000000099' as InvoiceId)).toBeNull();
  });

  describe('createDraft', () => {
    it('inserts the header and its lines in one transaction; listLines reads them back', async () => {
      const invoice = makeInvoice();
      const lines = [
        makeLine(invoice.id, { label: { fr: 'Math', ar: 'رياضيات' }, amountMad: 20000 }),
        makeLine(invoice.id, { kind: 'exam-prep', amountMad: 80000 }),
      ];
      await repo.createDraft(invoice, lines);

      expect(await repo.findById(invoice.id)).toEqual(invoice);
      const read = await repo.listLines(invoice.id);
      expect(read).toHaveLength(2);
      expect(read.map((l) => l.amountMad)).toEqual([20000, 80000]);
      expect(read[1]?.kind).toBe('exam-prep');
    });

    it('rolls back the whole draft if a line is invalid (atomic)', async () => {
      const invoice = makeInvoice();
      const bad = makeLine(invoice.id, { amountMad: -1 }); // violates CHECK (amount_mad >= 0)
      await expect(repo.createDraft(invoice, [bad])).rejects.toThrow();
      // The header must not survive a failed line insert.
      expect(await repo.findById(invoice.id)).toBeNull();
    });

    it('keeps lines write-once: re-inserting a line id fails', async () => {
      const invoice = makeInvoice();
      const line = makeLine(invoice.id);
      await repo.createDraft(invoice, [line]);

      const other = makeInvoice({ id: 'inv_00000000000000000000000002' as InvoiceId });
      // Same line id reused — the plain INSERT (no upsert) must reject it.
      await expect(repo.createDraft(other, [{ ...line, invoiceId: other.id }])).rejects.toThrow();
    });
  });

  describe('findByStudentMonth', () => {
    it('returns the live invoice for a student+month, and null after it is discarded', async () => {
      await repo.save(makeInvoice());
      expect((await repo.findByStudentMonth(STUDENT_A, '2026-09'))?.id).toBe(INVOICE_A);
      expect(await repo.findByStudentMonth(STUDENT_A, '2026-10')).toBeNull();
      expect(await repo.findByStudentMonth(STUDENT_B, '2026-09')).toBeNull();

      await repo.softDelete(INVOICE_A, new Date('2026-08-02T00:00:00Z'), USER);
      expect(await repo.findByStudentMonth(STUDENT_A, '2026-09')).toBeNull();
    });
  });

  describe('save (lifecycle upsert)', () => {
    it('updates status/issued_at + version but never identity on a second save', async () => {
      await repo.save(makeInvoice());
      await repo.save(
        makeInvoice({
          status: 'issued',
          issuedAt: new Date('2026-08-01T09:00:00Z'),
          version: 3,
          updatedAt: new Date('2026-08-01T09:00:00Z'),
        }),
      );
      const found = await repo.findById(INVOICE_A);
      expect(found?.status).toBe('issued');
      expect(found?.version).toBe(3);
      // Identity preserved.
      expect(found?.createdAt).toEqual(AT);
      expect(found?.deviceOrigin).toBe(DEVICE);
      expect(found?.studentId).toBe(STUDENT_A);
      expect(found?.month).toBe('2026-09');
    });
  });

  describe('softDelete + sync feeds', () => {
    it('hides the header from findById but keeps it as a tombstone in listChangedSince', async () => {
      await repo.save(makeInvoice());
      await repo.softDelete(INVOICE_A, new Date('2026-08-02T00:00:00Z'), USER);

      expect(await repo.findById(INVOICE_A)).toBeNull();
      const changed = await repo.listChangedSince(AT);
      expect(changed).toHaveLength(1);
      expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
      expect(changed[0]?.updatedBy).toBe(USER);
    });

    it('lists lines updated strictly after the cursor', async () => {
      const invoice = makeInvoice();
      await repo.createDraft(invoice, [
        makeLine(invoice.id, { updatedAt: new Date('2026-07-01T00:00:00Z') }),
        makeLine(invoice.id, { updatedAt: new Date('2026-07-20T00:00:00Z') }),
      ]);
      const changed = await repo.listLinesChangedSince(new Date('2026-07-10T00:00:00Z'));
      expect(changed).toHaveLength(1);
      expect(changed[0]?.updatedAt).toEqual(new Date('2026-07-20T00:00:00Z'));
    });
  });

  describe('DB constraints', () => {
    it('rejects an invoice id without the inv_ prefix (CHECK)', async () => {
      await expect(
        repo.save(makeInvoice({ id: 'bad_00000000000000000000000001' as InvoiceId })),
      ).rejects.toThrow();
    });

    it('rejects an unknown status (CHECK)', async () => {
      await expect(
        repo.save(makeInvoice({ status: 'paid' as InvoiceStatus })),
      ).rejects.toThrow();
    });

    it('rejects a line id without the invl_ prefix (CHECK)', async () => {
      const invoice = makeInvoice();
      await expect(
        repo.createDraft(invoice, [makeLine(invoice.id, { id: 'bad_1' as InvoiceLineId })]),
      ).rejects.toThrow();
    });

    it('rejects a line kind outside regular/exam-prep (CHECK)', async () => {
      const invoice = makeInvoice();
      await expect(
        repo.createDraft(invoice, [
          makeLine(invoice.id, { kind: 'summer' as InvoiceLine['kind'] }),
        ]),
      ).rejects.toThrow();
    });

    it('has NO UNIQUE(student_id, month): two live invoices are storable (domain guards duplicates)', async () => {
      // The domain refuses a duplicate; the *schema* must not, so concurrent
      // same-month creates converge on sync-resolve instead of a rejected push.
      await repo.save(makeInvoice({ id: 'inv_00000000000000000000000010' as InvoiceId }));
      await expect(
        repo.save(makeInvoice({ id: 'inv_00000000000000000000000011' as InvoiceId })),
      ).resolves.toBeUndefined();
    });
  });

  describe('migration replay', () => {
    it('applies 0017 cleanly on a DB already migrated to a prior version (0016)', () => {
      const fresh = mkdtempSync(join(tmpdir(), 'cs-inv-replay-'));
      const stale = openDatabase({ centreId: 'C2', key: KEY, dir: fresh });
      try {
        const all = loadMigrations(REAL_MIGRATIONS);
        const upTo16 = all.filter((m) => m.version <= 16);
        // A laptop that stopped at 0016: invoices does not exist yet.
        applyMigrations(stale, upTo16);
        expect(() => stale.prepare('SELECT 1 FROM invoices LIMIT 1').get()).toThrow();

        // Update to head: 0017 applies additively, no rebuild, no error.
        const applied = applyMigrations(stale, all);
        expect(applied).toContain(17);
        expect(stale.prepare('SELECT COUNT(*) AS n FROM invoices').get()).toEqual({ n: 0 });
        expect(stale.prepare('SELECT COUNT(*) AS n FROM invoice_lines').get()).toEqual({ n: 0 });
      } finally {
        stale.close();
        rmSync(fresh, { recursive: true, force: true });
      }
    });
  });
});
