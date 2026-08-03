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
  FormulaId,
  PaymentId,
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
import { SqlitePaymentRepository } from '../../src/data/sqlite/repositories/payment-repository';

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
    formulaId: 'fml_00000000000000000000000009' as FormulaId,
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
    it('returns the live invoice for a center+student+month, and null after it is discarded', async () => {
      await repo.save(makeInvoice());
      expect((await repo.findByStudentMonth(CENTER, STUDENT_A, '2026-09'))?.id).toBe(INVOICE_A);
      expect(await repo.findByStudentMonth(CENTER, STUDENT_A, '2026-10')).toBeNull();
      expect(await repo.findByStudentMonth(CENTER, STUDENT_B, '2026-09')).toBeNull();
      // Center-scoped in the query: another tenant never resolves this row.
      expect(
        await repo.findByStudentMonth('CS-RABAT-002' as CenterCode, STUDENT_A, '2026-09'),
      ).toBeNull();

      await repo.softDelete(INVOICE_A, new Date('2026-08-02T00:00:00Z'), USER);
      expect(await repo.findByStudentMonth(CENTER, STUDENT_A, '2026-09')).toBeNull();
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

    it('cascades the tombstone to its lines: a discarded invoice leaves no live lines', async () => {
      const invoice = makeInvoice();
      await repo.createDraft(invoice, [makeLine(invoice.id), makeLine(invoice.id)]);
      await repo.softDelete(invoice.id, new Date('2026-08-02T00:00:00Z'), USER);

      // Header hidden and no lines are live any more…
      expect(await repo.findById(invoice.id)).toBeNull();
      expect(await repo.listLines(invoice.id)).toHaveLength(0);
      // …but the lines survive as tombstones in the sync feed, carrying who/when.
      const changedLines = await repo.listLinesChangedSince(AT);
      expect(changedLines).toHaveLength(2);
      for (const line of changedLines) {
        expect(line.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
        expect(line.updatedBy).toBe(USER);
      }
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

  describe('listInvoices', () => {
    let paymentSeq = 0;
    function makePaymentRow(invoiceId: InvoiceId, amountMad: number) {
      paymentSeq += 1;
      return {
        id: `pay_${String(paymentSeq).padStart(26, '0')}` as PaymentId,
        centerCode: CENTER,
        deviceOrigin: DEVICE,
        createdAt: AT,
        updatedAt: AT,
        updatedBy: USER,
        deletedAt: null,
        version: 0,
        invoiceId,
        kind: 'payment' as const,
        amountMad,
        method: 'cash' as const,
        paidOn: '2026-08-05',
        reversesPaymentId: null,
        note: null,
      };
    }

    it('joins each invoice with its lines, total, and net paid — no filters returns every live invoice', async () => {
      const invoiceA = makeInvoice({ id: 'inv_00000000000000000000000021' as InvoiceId, month: '2026-09' });
      await repo.createDraft(invoiceA, [
        makeLine(invoiceA.id, { amountMad: 20000 }),
        makeLine(invoiceA.id, { amountMad: 15000 }),
      ]);
      const payments = new SqlitePaymentRepository(db);
      await payments.append(makePaymentRow(invoiceA.id, 10000));

      const invoiceB = makeInvoice({
        id: 'inv_00000000000000000000000022' as InvoiceId,
        studentId: STUDENT_B,
        month: '2026-10',
      });
      await repo.createDraft(invoiceB, [makeLine(invoiceB.id, { amountMad: 30000 })]);

      const rows = await repo.listInvoices(CENTER, {});
      expect(rows).toHaveLength(2);
      // Ordered newest month first.
      expect(rows[0]?.invoice.id).toBe(invoiceB.id);
      expect(rows[0]?.totalMad).toBe(30000);
      expect(rows[0]?.netPaidMad).toBe(0);
      expect(rows[0]?.lines).toHaveLength(1);

      expect(rows[1]?.invoice.id).toBe(invoiceA.id);
      expect(rows[1]?.totalMad).toBe(35000);
      expect(rows[1]?.netPaidMad).toBe(10000);
      expect(rows[1]?.lines).toHaveLength(2);
    });

    it('nets a reversal against its payment', async () => {
      const invoice = makeInvoice({ id: 'inv_00000000000000000000000023' as InvoiceId });
      await repo.createDraft(invoice, [makeLine(invoice.id, { amountMad: 40000 })]);
      const payments = new SqlitePaymentRepository(db);
      const original = makePaymentRow(invoice.id, 40000);
      await payments.append(original);
      await payments.append({ ...makePaymentRow(invoice.id, 40000), kind: 'reversal', reversesPaymentId: original.id });

      const rows = await repo.listInvoices(CENTER, {});
      expect(rows[0]?.netPaidMad).toBe(0);
    });

    it('an invoice with no lines and no payments reads total 0 / net 0', async () => {
      await repo.save(makeInvoice({ id: 'inv_00000000000000000000000024' as InvoiceId }));
      const rows = await repo.listInvoices(CENTER, {});
      expect(rows).toHaveLength(1);
      expect(rows[0]?.totalMad).toBe(0);
      expect(rows[0]?.netPaidMad).toBe(0);
      expect(rows[0]?.lines).toEqual([]);
    });

    it('filters by month, studentId, and invoiceId', async () => {
      const sept = makeInvoice({ id: 'inv_00000000000000000000000031' as InvoiceId, month: '2026-09', studentId: STUDENT_A });
      await repo.createDraft(sept, [makeLine(sept.id, { amountMad: 10000 })]);
      const oct = makeInvoice({ id: 'inv_00000000000000000000000032' as InvoiceId, month: '2026-10', studentId: STUDENT_B });
      await repo.createDraft(oct, [makeLine(oct.id, { amountMad: 20000 })]);

      expect((await repo.listInvoices(CENTER, { month: '2026-09' })).map((r) => r.invoice.id)).toEqual([sept.id]);
      expect((await repo.listInvoices(CENTER, { studentId: STUDENT_B })).map((r) => r.invoice.id)).toEqual([oct.id]);
      expect((await repo.listInvoices(CENTER, { invoiceId: oct.id })).map((r) => r.invoice.id)).toEqual([oct.id]);
    });

    it('includes cancelled invoices (never hidden) but excludes soft-deleted ones', async () => {
      const cancelled = makeInvoice({
        id: 'inv_00000000000000000000000041' as InvoiceId,
        status: 'cancelled',
        cancelledAt: new Date('2026-08-03T00:00:00Z'),
      });
      await repo.createDraft(cancelled, [makeLine(cancelled.id, { amountMad: 5000 })]);

      const discarded = makeInvoice({ id: 'inv_00000000000000000000000042' as InvoiceId });
      await repo.createDraft(discarded, [makeLine(discarded.id, { amountMad: 5000 })]);
      await repo.softDelete(discarded.id, new Date('2026-08-04T00:00:00Z'), USER);

      const rows = await repo.listInvoices(CENTER, {});
      const ids = rows.map((r) => r.invoice.id);
      expect(ids).toContain(cancelled.id);
      expect(ids).not.toContain(discarded.id);
    });

    it('never returns another center’s invoices', async () => {
      await repo.save(makeInvoice({ id: 'inv_00000000000000000000000051' as InvoiceId }));
      expect(await repo.listInvoices('CS-RABAT-002' as CenterCode, {})).toEqual([]);
    });

    it('returns an empty array for a center with no invoices', async () => {
      expect(await repo.listInvoices(CENTER, {})).toEqual([]);
    });
  });

  describe('migration replay', () => {
    it('applies 0018 cleanly on a DB already migrated to a prior version (0017)', () => {
      const fresh = mkdtempSync(join(tmpdir(), 'cs-inv-replay-'));
      const stale = openDatabase({ centreId: 'C2', key: KEY, dir: fresh });
      try {
        const all = loadMigrations(REAL_MIGRATIONS);
        const upTo17 = all.filter((m) => m.version <= 17);
        // A laptop that stopped at 0017: invoices does not exist yet.
        applyMigrations(stale, upTo17);
        expect(() => stale.prepare('SELECT 1 FROM invoices LIMIT 1').get()).toThrow();

        // Update to head: 0018 applies additively, no rebuild, no error.
        const applied = applyMigrations(stale, all);
        expect(applied).toContain(18);
        expect(stale.prepare('SELECT COUNT(*) AS n FROM invoices').get()).toEqual({ n: 0 });
        expect(stale.prepare('SELECT COUNT(*) AS n FROM invoice_lines').get()).toEqual({ n: 0 });
      } finally {
        stale.close();
        rmSync(fresh, { recursive: true, force: true });
      }
    });
  });
});
