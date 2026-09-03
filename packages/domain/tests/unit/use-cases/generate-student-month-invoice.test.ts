import { describe, it, expect, beforeEach } from 'vitest';
import {
  GenerateStudentMonthInvoice,
  type GenerateStudentMonthInvoiceInput,
} from '../../../src/use-cases/generate-student-month-invoice';
import { CreateInvoiceDraft, type CreateInvoiceDraftInput } from '../../../src/use-cases/create-invoice-draft';
import { IssueInvoice } from '../../../src/use-cases/issue-invoice';
import { CancelInvoice } from '../../../src/use-cases/cancel-invoice';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { DuplicateInvoiceError } from '../../../src/errors/invoice-errors';
import type { InvoiceId } from '../../../src/entities/invoice';
import type { StudentId } from '../../../src/entities/student';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryInvoiceRepository } from '../fakes/in-memory-invoice-repository';
import { fakeClock } from '../fakes/clock';
import { planWithoutFeature } from '../fakes/plans';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const STUDENT = 'stu_00000000000000000000000001' as StudentId;
const FORMULA_MATH = 'fml_00000000000000000000000001';
const FORMULA_BAC = 'fml_00000000000000000000000002';
const CLOCK_ISO = '2026-07-28T10:00:00Z';

function mathLine() {
  return {
    formulaId: FORMULA_MATH,
    label: { fr: 'Math', ar: 'رياضيات' },
    kind: 'regular' as const,
    amountMad: 20000,
  };
}

function bacLine() {
  return {
    formulaId: FORMULA_BAC,
    label: { fr: 'Préparation Bac', ar: 'تحضير الباك' },
    kind: 'exam-prep' as const,
    amountMad: 80000,
  };
}

describe('GenerateStudentMonthInvoice', () => {
  let invoices: InMemoryInvoiceRepository;

  function build(plan: Plan = PLANS.essentiel): GenerateStudentMonthInvoice {
    const policy = new PlanPolicy(plan);
    const createInvoiceDraft = new CreateInvoiceDraft(invoices, fakeClock(CLOCK_ISO), policy);
    return new GenerateStudentMonthInvoice(
      invoices,
      createInvoiceDraft,
      fakeClock(CLOCK_ISO),
      policy,
    );
  }

  function validInput(
    overrides: Partial<GenerateStudentMonthInvoiceInput> = {},
  ): GenerateStudentMonthInvoiceInput {
    return {
      studentId: STUDENT,
      month: '2026-09',
      lines: [mathLine()],
      centerCode: CENTER,
      deviceOrigin: DEVICE,
      updatedBy: USER,
      ...overrides,
    };
  }

  async function issueInvoice(invoiceId: InvoiceId): Promise<void> {
    await new IssueInvoice(invoices, fakeClock(CLOCK_ISO), new PlanPolicy(PLANS.essentiel)).execute(
      { centerCode: CENTER, invoiceId, updatedBy: USER },
    );
  }

  beforeEach(() => {
    invoices = new InMemoryInvoiceRepository();
  });

  describe('no invoice for the month yet', () => {
    it('creates a fresh draft through CreateInvoiceDraft and reports created', async () => {
      const result = await build().execute(validInput());

      expect(result.outcome).toBe('created');
      const invoice = await invoices.findByStudentMonth(CENTER, STUDENT, '2026-09');
      expect(invoice).not.toBeNull();
      expect(result.invoiceId).toBe(invoice!.id);
      expect(invoice!.status).toBe('draft');
      const lines = await invoices.listLines(invoice!.id);
      expect(lines).toHaveLength(1);
      expect(lines[0]?.amountMad).toBe(20000);
    });
  });

  describe('a live draft already exists', () => {
    it('appends the not-yet-billed lines to it with fresh envelopes (line-appended)', async () => {
      const first = await build().execute(validInput({ lines: [mathLine()] }));

      const second = await build().execute(validInput({ lines: [mathLine(), bacLine()] }));

      expect(second).toEqual({ outcome: 'line-appended', invoiceId: first.invoiceId });
      expect(invoices.all()).toHaveLength(1);
      const lines = await invoices.listLines(first.invoiceId);
      expect(lines).toHaveLength(2);
      const appended = lines.find((line) => line.kind === 'exam-prep');
      expect(appended?.id).toMatch(/^invl_/);
      expect(appended?.amountMad).toBe(80000);
      expect(appended?.invoiceId).toBe(first.invoiceId);
      expect(appended?.version).toBe(0);
      expect(appended?.deletedAt).toBeNull();
      expect(appended?.createdAt).toEqual(new Date(CLOCK_ISO));
    });

    it('is idempotent: a (formulaId, kind) already on the draft is never appended twice (already-billed)', async () => {
      const first = await build().execute(validInput());

      const again = await build().execute(validInput());

      expect(again).toEqual({ outcome: 'already-billed', invoiceId: first.invoiceId });
      expect(await invoices.listLines(first.invoiceId)).toHaveLength(1);
      expect(invoices.all()).toHaveLength(1);
    });

    it('treats the same formula billed under another kind as a distinct line', async () => {
      const first = await build().execute(validInput({ lines: [mathLine()] }));

      const second = await build().execute(
        validInput({ lines: [{ ...mathLine(), kind: 'exam-prep' as const }] }),
      );

      expect(second.outcome).toBe('line-appended');
      expect(await invoices.listLines(first.invoiceId)).toHaveLength(2);
    });
  });

  describe('the month is already frozen', () => {
    it('never touches an issued invoice (issued-skipped)', async () => {
      const first = await build().execute(validInput());
      await issueInvoice(first.invoiceId);

      const result = await build().execute(validInput({ lines: [bacLine()] }));

      expect(result).toEqual({ outcome: 'issued-skipped', invoiceId: first.invoiceId });
      expect(await invoices.listLines(first.invoiceId)).toHaveLength(1);
    });

    it('never touches a cancelled invoice either (issued-skipped) — a human closed that month on purpose', async () => {
      const first = await build().execute(validInput());
      await new CancelInvoice(invoices, fakeClock(CLOCK_ISO), new PlanPolicy(PLANS.essentiel)).execute(
        { centerCode: CENTER, invoiceId: first.invoiceId, updatedBy: USER },
      );

      const result = await build().execute(validInput({ lines: [bacLine()] }));

      expect(result).toEqual({ outcome: 'issued-skipped', invoiceId: first.invoiceId });
      expect(await invoices.listLines(first.invoiceId)).toHaveLength(1);
    });
  });

  describe('DuplicateInvoiceError race (a concurrent generator created the month between read and create)', () => {
    function buildWithDelegate(
      delegate: Pick<CreateInvoiceDraft, 'execute'>,
    ): GenerateStudentMonthInvoice {
      const policy = new PlanPolicy(PLANS.essentiel);
      return new GenerateStudentMonthInvoice(invoices, delegate, fakeClock(CLOCK_ISO), policy);
    }

    // Simulates the single-process async interleaving: another generator creates the
    // month's draft after this use case's null read, so the delegate's own guard fires.
    function delegateLosingRaceTo(
      concurrentInput: GenerateStudentMonthInvoiceInput,
    ): Pick<CreateInvoiceDraft, 'execute'> {
      const concurrentCreate = new CreateInvoiceDraft(
        invoices,
        fakeClock(CLOCK_ISO),
        new PlanPolicy(PLANS.essentiel),
      );
      return {
        execute: async (input: CreateInvoiceDraftInput) => {
          await concurrentCreate.execute(concurrentInput);
          throw new DuplicateInvoiceError(STUDENT, input.month);
        },
      };
    }

    it('converges to already-billed when the raced draft already carries the requested line', async () => {
      const useCase = buildWithDelegate(delegateLosingRaceTo(validInput({ lines: [mathLine()] })));

      const result = await useCase.execute(validInput({ lines: [mathLine()] }));

      expect(result.outcome).toBe('already-billed');
      expect(invoices.all()).toHaveLength(1);
      expect(await invoices.listLines(result.invoiceId)).toHaveLength(1);
    });

    it('converges to line-appended when the raced draft misses the requested line', async () => {
      const useCase = buildWithDelegate(delegateLosingRaceTo(validInput({ lines: [bacLine()] })));

      const result = await useCase.execute(validInput({ lines: [mathLine()] }));

      expect(result.outcome).toBe('line-appended');
      expect(invoices.all()).toHaveLength(1);
      const lines = await invoices.listLines(result.invoiceId);
      expect(lines).toHaveLength(2);
      expect(lines.map((line) => line.kind).sort()).toEqual(['exam-prep', 'regular']);
    });

    it('rethrows when the re-fetch still resolves no live invoice (guard fired without a row)', async () => {
      const phantomGuard: Pick<CreateInvoiceDraft, 'execute'> = {
        execute: async (input: CreateInvoiceDraftInput) => {
          throw new DuplicateInvoiceError(STUDENT, input.month);
        },
      };
      await expect(buildWithDelegate(phantomGuard).execute(validInput())).rejects.toBeInstanceOf(
        DuplicateInvoiceError,
      );
      expect(invoices.all()).toHaveLength(0);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.invoicing', async () => {
      await expect(
        build(planWithoutFeature('core.invoicing')).execute(validInput()),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(invoices.all()).toHaveLength(0);
    });
  });

  describe('validation', () => {
    it('rejects an invalid month', async () => {
      await expect(build().execute(validInput({ month: '2026-13' }))).rejects.toThrow();
    });

    it('rejects an empty line list', async () => {
      await expect(build().execute(validInput({ lines: [] }))).rejects.toThrow();
    });

    it('rejects a malformed student id', async () => {
      await expect(
        build().execute(validInput({ studentId: 'not-an-id' })),
      ).rejects.toThrow();
    });
  });
});
