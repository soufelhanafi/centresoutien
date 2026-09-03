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
  SubjectId,
  PaymentId,
  Student,
  StudentId,
  UserId,
} from '@centresoutien/domain';
import { SqliteStudentRepository } from '../../src/data/sqlite/repositories/student-repository';
import { openDatabase } from '../../src/data/sqlite/db';
import {
  loadMigrations,
  applyMigrations,
  runMigrations,
} from '../../src/data/sqlite/migration-runner';
import { SqliteInvoiceRepository } from '../../src/data/sqlite/repositories/invoice-repository';
import { SqlitePaymentRepository } from '../../src/data/sqlite/repositories/payment-repository';
import {
  InvoiceLineNotFoundError,
  InvoiceNotDraftError,
  InvoiceNotFoundError,
} from '@centresoutien/domain';

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
    subjectAllocation: null,
    ...over,
  };
}

function makeStudent(id: StudentId, name: { fr: string; ar: string }): Student {
  return {
    id,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    naturalKey: `${CENTER}::${name.fr.toLowerCase().replace(/\s+/g, '')}::2012-05-03`,
    name,
    birthDate: '2012-05-03',
    level: '3AC',
    school: null,
    notes: null,
    guardianIds: [],
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

  it('round-trips a manual per-subject attribution allocation (SOU-298)', async () => {
    const invoice = makeInvoice({
      subjectAllocation: [
        { subjectId: 'sub_00000000000000000000000001' as SubjectId, amountMad: 20000 },
        { subjectId: 'sub_00000000000000000000000002' as SubjectId, amountMad: 15000 },
      ],
    });
    await repo.save(invoice);
    expect(await repo.findById(invoice.id)).toEqual(invoice);
  });

  it('round-trips a null allocation (weighted default)', async () => {
    await repo.save(makeInvoice());
    expect((await repo.findById(INVOICE_A))?.subjectAllocation).toBeNull();
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

    it('resurrects a tombstoned line via upsert instead of failing on the reused deterministic id', async () => {
      // Invoice line ids are now `deriveInvoiceLineId(invoiceId, formulaId, kind)`
      // (deterministic), not a random ULID: discarding a draft and regenerating
      // the same student-month with the same formula bundle re-inserts the exact
      // same id as a still-present, but tombstoned, row. `INSERT_LINE_SQL`'s
      // `ON CONFLICT(id) DO UPDATE` resurrects it with the fresh snapshot instead
      // of failing the whole draft transaction on a primary-key clash.
      const invoice = makeInvoice();
      const line = makeLine(invoice.id, { amountMad: 20000 });
      await repo.createDraft(invoice, [line]);
      await repo.softDelete(invoice.id, new Date('2026-08-01T00:00:00Z'), USER);

      const resurrectedLine: InvoiceLine = { ...line, amountMad: 25000, deletedAt: null };
      await repo.createDraft(invoice, [resurrectedLine]);

      const read = await repo.listLines(invoice.id);
      expect(read).toHaveLength(1);
      expect(read[0]?.id).toBe(line.id);
      expect(read[0]?.amountMad).toBe(25000);
      expect(read[0]?.deletedAt).toBeNull();
    });
  });

  describe('appendLinesToDraft (SOU-289, draft-only)', () => {
    it('appends lines to a live draft; listLines reads the union back', async () => {
      const invoice = makeInvoice();
      await repo.createDraft(invoice, [makeLine(invoice.id, { amountMad: 20000 })]);

      await repo.appendLinesToDraft(invoice.id, [
        makeLine(invoice.id, { kind: 'exam-prep', amountMad: 80000 }),
      ]);

      const lines = await repo.listLines(invoice.id);
      expect(lines).toHaveLength(2);
      expect(lines.map((l) => l.amountMad).sort((a, b) => a - b)).toEqual([20000, 80000]);
    });

    it('rejects an issued invoice with InvoiceNotDraftError and inserts nothing', async () => {
      const invoice = makeInvoice({ status: 'issued', issuedAt: new Date('2026-08-01T09:00:00Z') });
      await repo.createDraft(invoice, [makeLine(invoice.id)]);

      await expect(
        repo.appendLinesToDraft(invoice.id, [makeLine(invoice.id, { kind: 'exam-prep' })]),
      ).rejects.toBeInstanceOf(InvoiceNotDraftError);
      expect(await repo.listLines(invoice.id)).toHaveLength(1);
    });

    it('rejects a cancelled invoice with InvoiceNotDraftError', async () => {
      const invoice = makeInvoice({
        status: 'cancelled',
        cancelledAt: new Date('2026-08-01T09:00:00Z'),
      });
      await repo.createDraft(invoice, [makeLine(invoice.id)]);

      await expect(
        repo.appendLinesToDraft(invoice.id, [makeLine(invoice.id, { kind: 'exam-prep' })]),
      ).rejects.toBeInstanceOf(InvoiceNotDraftError);
    });

    it('rejects an unknown or discarded invoice with InvoiceNotFoundError', async () => {
      const unknown = 'inv_00000000000000000000000098' as InvoiceId;
      await expect(repo.appendLinesToDraft(unknown, [makeLine(unknown)])).rejects.toBeInstanceOf(
        InvoiceNotFoundError,
      );

      const discarded = makeInvoice();
      await repo.createDraft(discarded, [makeLine(discarded.id)]);
      await repo.softDelete(discarded.id, new Date('2026-08-02T00:00:00Z'), USER);
      await expect(
        repo.appendLinesToDraft(discarded.id, [makeLine(discarded.id)]),
      ).rejects.toBeInstanceOf(InvoiceNotFoundError);
    });

    it('skips a line whose live (formula_id, kind) is already on the invoice — a raced double append inserts once', async () => {
      const invoice = makeInvoice();
      const first = makeLine(invoice.id, { amountMad: 20000 });
      await repo.createDraft(invoice, [first]);

      // Same (formula_id, kind) computed as "missing" by two interleaved generators:
      // the second append must be dropped in-transaction, never double-billed.
      await repo.appendLinesToDraft(invoice.id, [
        makeLine(invoice.id, { formulaId: first.formulaId, kind: first.kind, amountMad: 20000 }),
      ]);

      const lines = await repo.listLines(invoice.id);
      expect(lines).toHaveLength(1);
      expect(lines[0]?.id).toBe(first.id);
    });

    it('deduplicates the same (formula_id, kind) within one supplied batch', async () => {
      const invoice = makeInvoice();
      await repo.createDraft(invoice, [makeLine(invoice.id)]);

      await repo.appendLinesToDraft(invoice.id, [
        makeLine(invoice.id, { kind: 'exam-prep', amountMad: 80000 }),
        makeLine(invoice.id, { kind: 'exam-prep', amountMad: 80000 }),
      ]);

      expect(await repo.listLines(invoice.id)).toHaveLength(2);
    });

    it('only LIVE lines block the insert: a tombstoned (formula_id, kind) may be re-billed', async () => {
      const invoice = makeInvoice();
      const original = makeLine(invoice.id);
      await repo.createDraft(invoice, [original]);
      // A synced-in tombstone on the line (the port itself only cascades deletes
      // from the header): the key must free up for a fresh append.
      db.prepare('UPDATE invoice_lines SET deleted_at = ? WHERE id = ?').run(
        '2026-08-02T00:00:00.000Z',
        original.id,
      );

      const replacement = makeLine(invoice.id, {
        formulaId: original.formulaId,
        kind: original.kind,
      });
      await repo.appendLinesToDraft(invoice.id, [replacement]);

      const lines = await repo.listLines(invoice.id);
      expect(lines).toHaveLength(1);
      expect(lines[0]?.id).toBe(replacement.id);
    });

    it('is atomic: an invalid line rolls back the whole append', async () => {
      const invoice = makeInvoice();
      await repo.createDraft(invoice, [makeLine(invoice.id)]);

      await expect(
        repo.appendLinesToDraft(invoice.id, [
          makeLine(invoice.id, { kind: 'exam-prep' }),
          // Fresh (formula_id, kind) so the idempotency skip lets it through to the
          // INSERT, where it violates CHECK (amount_mad >= 0).
          makeLine(invoice.id, {
            formulaId: 'fml_00000000000000000000000010' as FormulaId,
            amountMad: -1,
          }),
        ]),
      ).rejects.toThrow();
      expect(await repo.listLines(invoice.id)).toHaveLength(1);
    });
  });

  describe('updateDraftLineAmount (SOU-289, draft-only)', () => {
    it('rewrites amount_mad + updated_at/updated_by and nothing else', async () => {
      const invoice = makeInvoice();
      const line = makeLine(invoice.id, { amountMad: 20000 });
      await repo.createDraft(invoice, [line]);

      const editedAt = new Date('2026-08-02T09:00:00Z');
      const editor = 'usr_00000000000000000000000002' as UserId;
      await repo.updateDraftLineAmount({
        ...line,
        amountMad: 15000,
        updatedAt: editedAt,
        updatedBy: editor,
      });

      const [read] = await repo.listLines(invoice.id);
      expect(read?.amountMad).toBe(15000);
      expect(read?.updatedAt).toEqual(editedAt);
      expect(read?.updatedBy).toBe(editor);
      // Billed snapshot, identity, and the hub's version stay untouched.
      expect(read?.formulaId).toBe(line.formulaId);
      expect(read?.label).toEqual(line.label);
      expect(read?.kind).toBe(line.kind);
      expect(read?.createdAt).toEqual(line.createdAt);
      expect(read?.version).toBe(line.version);
      expect(read?.deletedAt).toBeNull();
    });

    it('surfaces the edited line in the line sync feed (updated_at moved)', async () => {
      const invoice = makeInvoice();
      const line = makeLine(invoice.id);
      await repo.createDraft(invoice, [line]);

      const editedAt = new Date('2026-08-02T09:00:00Z');
      await repo.updateDraftLineAmount({ ...line, amountMad: 12345, updatedAt: editedAt, updatedBy: USER });

      const changed = await repo.listLinesChangedSince(new Date('2026-08-01T00:00:00Z'));
      expect(changed).toHaveLength(1);
      expect(changed[0]?.amountMad).toBe(12345);
    });

    it('rejects a non-draft invoice with InvoiceNotDraftError and writes nothing', async () => {
      const invoice = makeInvoice({ status: 'issued', issuedAt: new Date('2026-08-01T09:00:00Z') });
      const line = makeLine(invoice.id, { amountMad: 20000 });
      await repo.createDraft(invoice, [line]);

      await expect(
        repo.updateDraftLineAmount({ ...line, amountMad: 15000 }),
      ).rejects.toBeInstanceOf(InvoiceNotDraftError);
      expect((await repo.listLines(invoice.id))[0]?.amountMad).toBe(20000);
    });

    it('rejects an unknown invoice with InvoiceNotFoundError', async () => {
      const unknown = 'inv_00000000000000000000000097' as InvoiceId;
      await expect(repo.updateDraftLineAmount(makeLine(unknown))).rejects.toBeInstanceOf(
        InvoiceNotFoundError,
      );
    });

    it('rejects a line id with no live row on the invoice with InvoiceLineNotFoundError', async () => {
      const invoice = makeInvoice();
      await repo.createDraft(invoice, [makeLine(invoice.id)]);

      const phantom = makeLine(invoice.id, {
        id: 'invl_00000000000000000000000777' as InvoiceLineId,
      });
      await expect(repo.updateDraftLineAmount(phantom)).rejects.toBeInstanceOf(
        InvoiceLineNotFoundError,
      );
    });

    it("rejects another invoice's line (the invoice_id is part of the match)", async () => {
      const invoiceA = makeInvoice();
      const lineA = makeLine(invoiceA.id);
      await repo.createDraft(invoiceA, [lineA]);
      const invoiceB = makeInvoice({
        id: 'inv_00000000000000000000000002' as InvoiceId,
        studentId: STUDENT_B,
      });
      await repo.createDraft(invoiceB, [makeLine(invoiceB.id)]);

      await expect(
        repo.updateDraftLineAmount({ ...lineA, invoiceId: invoiceB.id }),
      ).rejects.toBeInstanceOf(InvoiceLineNotFoundError);
      expect((await repo.listLines(invoiceA.id))[0]?.amountMad).toBe(lineA.amountMad);
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

      const { rows } = await repo.listInvoices(CENTER, {});
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

      const { rows } = await repo.listInvoices(CENTER, {});
      expect(rows[0]?.netPaidMad).toBe(0);
    });

    it('an invoice with no lines and no payments reads total 0 / net 0', async () => {
      await repo.save(makeInvoice({ id: 'inv_00000000000000000000000024' as InvoiceId }));
      const { rows } = await repo.listInvoices(CENTER, {});
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

      expect((await repo.listInvoices(CENTER, { month: '2026-09' })).rows.map((r) => r.invoice.id)).toEqual([sept.id]);
      expect((await repo.listInvoices(CENTER, { studentId: STUDENT_B })).rows.map((r) => r.invoice.id)).toEqual([oct.id]);
      expect((await repo.listInvoices(CENTER, { invoiceId: oct.id })).rows.map((r) => r.invoice.id)).toEqual([oct.id]);
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

      const { rows } = await repo.listInvoices(CENTER, {});
      const ids = rows.map((r) => r.invoice.id);
      expect(ids).toContain(cancelled.id);
      expect(ids).not.toContain(discarded.id);
    });

    it('never returns another center’s invoices', async () => {
      await repo.save(makeInvoice({ id: 'inv_00000000000000000000000051' as InvoiceId }));
      const page = await repo.listInvoices('CS-RABAT-002' as CenterCode, {});
      expect(page.rows).toEqual([]);
      expect(page.nextCursor).toBeNull();
    });

    it('returns an empty array for a center with no invoices', async () => {
      const page = await repo.listInvoices(CENTER, {});
      expect(page.rows).toEqual([]);
      expect(page.nextCursor).toBeNull();
    });

    it('openOnly returns only non-cancelled invoices that still owe money', async () => {
      const payments = new SqlitePaymentRepository(db);

      const paid = makeInvoice({ id: 'inv_00000000000000000000000061' as InvoiceId, studentId: STUDENT_A });
      await repo.createDraft(paid, [makeLine(paid.id, { amountMad: 20000 })]);
      await payments.append(makePaymentRow(paid.id, 20000)); // fully paid → excluded

      const owing = makeInvoice({ id: 'inv_00000000000000000000000062' as InvoiceId, studentId: STUDENT_B });
      await repo.createDraft(owing, [makeLine(owing.id, { amountMad: 30000 })]);
      await payments.append(makePaymentRow(owing.id, 10000)); // partial → included

      const cancelledOwing = makeInvoice({
        id: 'inv_00000000000000000000000063' as InvoiceId,
        status: 'cancelled',
        cancelledAt: new Date('2026-08-03T00:00:00Z'),
      });
      await repo.createDraft(cancelledOwing, [makeLine(cancelledOwing.id, { amountMad: 40000 })]); // owes but cancelled → excluded

      const { rows } = await repo.listInvoices(CENTER, { openOnly: true });
      expect(rows.map((r) => r.invoice.id)).toEqual([owing.id]);
    });

    it('paginates by keyset (created_at DESC, id tiebreaker) with a nextCursor, then drains to null', async () => {
      const ids = [
        'inv_00000000000000000000000071',
        'inv_00000000000000000000000072',
        'inv_00000000000000000000000073',
      ] as InvoiceId[];
      for (const id of ids) {
        const inv = makeInvoice({ id, studentId: STUDENT_A });
        await repo.createDraft(inv, [makeLine(inv.id, { amountMad: 10000 })]);
      }

      const page1 = await repo.listInvoices(CENTER, { pageSize: 2 });
      // Every row shares the same createdAt (AT) here, so the tiebreaker (id DESC)
      // alone decides order — same as ULID recency used to, by coincidence.
      expect(page1.rows.map((r) => r.invoice.id)).toEqual([ids[2], ids[1]]);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await repo.listInvoices(CENTER, {
        pageSize: 2,
        cursor: page1.nextCursor ?? undefined,
      });
      expect(page2.rows.map((r) => r.invoice.id)).toEqual([ids[0]]);
      expect(page2.nextCursor).toBeNull();
    });

    it('orders by recency (created_at), not by the deterministic id\'s own lexicographic order', async () => {
      // A deliberately adversarial id/time pairing: the invoice created MOST
      // recently has the LEXICOGRAPHICALLY SMALLEST id, and vice versa. Invoice
      // ids are now a deterministic composite key (centerCode+studentId+month),
      // not a time-sortable ULID, so a correct keyset must ignore id order for
      // recency and use `created_at` — this is exactly the bug `ORDER BY id DESC`
      // would reintroduce.
      const oldest = makeInvoice({
        id: 'inv_zz-oldest' as InvoiceId,
        studentId: STUDENT_A,
        month: '2026-01',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      const middle = makeInvoice({
        id: 'inv_mm-middle' as InvoiceId,
        studentId: STUDENT_A,
        month: '2026-02',
        createdAt: new Date('2026-02-01T00:00:00Z'),
      });
      const newest = makeInvoice({
        id: 'inv_aa-newest' as InvoiceId,
        studentId: STUDENT_A,
        month: '2026-03',
        createdAt: new Date('2026-03-01T00:00:00Z'),
      });
      for (const inv of [oldest, middle, newest]) {
        await repo.createDraft(inv, [makeLine(inv.id, { amountMad: 10000 })]);
      }

      const page1 = await repo.listInvoices(CENTER, { pageSize: 2 });
      expect(page1.rows.map((r) => r.invoice.id)).toEqual([newest.id, middle.id]);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await repo.listInvoices(CENTER, {
        pageSize: 2,
        cursor: page1.nextCursor ?? undefined,
      });
      expect(page2.rows.map((r) => r.invoice.id)).toEqual([oldest.id]);
      expect(page2.nextCursor).toBeNull();
    });

    it('searches by the student’s fr/ar name substring', async () => {
      const students = new SqliteStudentRepository(db);
      await students.save(makeStudent(STUDENT_A, { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' }));
      await students.save(makeStudent(STUDENT_B, { fr: 'Salma Bennani', ar: 'سلمى بناني' }));

      const a = makeInvoice({ id: 'inv_00000000000000000000000081' as InvoiceId, studentId: STUDENT_A });
      await repo.createDraft(a, [makeLine(a.id, { amountMad: 10000 })]);
      const b = makeInvoice({ id: 'inv_00000000000000000000000082' as InvoiceId, studentId: STUDENT_B });
      await repo.createDraft(b, [makeLine(b.id, { amountMad: 10000 })]);

      expect((await repo.listInvoices(CENTER, { search: 'yass' })).rows.map((r) => r.invoice.id)).toEqual([a.id]);
      expect((await repo.listInvoices(CENTER, { search: 'سلمى' })).rows.map((r) => r.invoice.id)).toEqual([b.id]);
    });

    it('searches diacritic-insensitively — accented fr name matches its folded form', async () => {
      const students = new SqliteStudentRepository(db);
      await students.save(makeStudent(STUDENT_A, { fr: 'Éric Benörî', ar: 'إريك بنعمر' }));

      const inv = makeInvoice({ id: 'inv_00000000000000000000000101' as InvoiceId, studentId: STUDENT_A });
      await repo.createDraft(inv, [makeLine(inv.id, { amountMad: 10000 })]);

      // SQLite LOWER() would leave 'É' untouched and miss this; nfd_fold matches.
      expect((await repo.listInvoices(CENTER, { search: 'eric benori' })).rows.map((r) => r.invoice.id)).toEqual([inv.id]);
      // Arabic folds unchanged (no combining Latin marks).
      expect((await repo.listInvoices(CENTER, { search: 'إريك' })).rows.map((r) => r.invoice.id)).toEqual([inv.id]);
    });

    it('treats _ and % in the term literally, not as LIKE wildcards', async () => {
      const students = new SqliteStudentRepository(db);
      await students.save(makeStudent(STUDENT_A, { fr: 'Groupe A_B', ar: 'مجموعة' }));
      await students.save(makeStudent(STUDENT_B, { fr: 'Groupe AXB', ar: 'فريق' }));

      const withUnderscore = makeInvoice({ id: 'inv_00000000000000000000000111' as InvoiceId, studentId: STUDENT_A });
      await repo.createDraft(withUnderscore, [makeLine(withUnderscore.id, { amountMad: 10000 })]);
      const withoutUnderscore = makeInvoice({ id: 'inv_00000000000000000000000112' as InvoiceId, studentId: STUDENT_B });
      await repo.createDraft(withoutUnderscore, [makeLine(withoutUnderscore.id, { amountMad: 10000 })]);

      // Unescaped, '_' is a single-char wildcard and would also match 'Groupe AXB'.
      expect((await repo.listInvoices(CENTER, { search: 'a_b' })).rows.map((r) => r.invoice.id)).toEqual([
        withUnderscore.id,
      ]);
      // '%' would match anything unescaped; here it matches only a literal percent.
      expect((await repo.listInvoices(CENTER, { search: 'a%b' })).rows).toEqual([]);
    });

    it('exposes the resolved bilingual studentName from the students join', async () => {
      const students = new SqliteStudentRepository(db);
      await students.save(makeStudent(STUDENT_A, { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' }));

      const withStudent = makeInvoice({ id: 'inv_00000000000000000000000091' as InvoiceId, studentId: STUDENT_A });
      await repo.createDraft(withStudent, [makeLine(withStudent.id, { amountMad: 10000 })]);
      // A second invoice whose student row never synced → empty-string fallback.
      const orphan = makeInvoice({ id: 'inv_00000000000000000000000092' as InvoiceId, studentId: STUDENT_B });
      await repo.createDraft(orphan, [makeLine(orphan.id, { amountMad: 10000 })]);

      const byId = new Map(
        (await repo.listInvoices(CENTER, {})).rows.map((r) => [r.invoice.id, r.studentName]),
      );
      expect(byId.get(withStudent.id)).toEqual({ fr: 'Yassine Alaoui', ar: 'ياسين العلوي' });
      expect(byId.get(orphan.id)).toEqual({ fr: '', ar: '' });
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
