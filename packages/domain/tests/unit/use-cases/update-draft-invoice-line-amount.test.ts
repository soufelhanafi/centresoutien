import { describe, it, expect, beforeEach } from 'vitest';
import {
  UpdateDraftInvoiceLineAmount,
  type UpdateDraftInvoiceLineAmountInput,
} from '../../../src/use-cases/update-draft-invoice-line-amount';
import { CreateInvoiceDraft } from '../../../src/use-cases/create-invoice-draft';
import { IssueInvoice } from '../../../src/use-cases/issue-invoice';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import {
  InvoiceLineNotFoundError,
  InvoiceNotDraftError,
  InvoiceNotFoundError,
} from '../../../src/errors/invoice-errors';
import type { Invoice } from '../../../src/entities/invoice';
import type { InvoiceLine, InvoiceLineId } from '../../../src/entities/invoice-line';
import type { StudentId } from '../../../src/entities/student';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryInvoiceRepository } from '../fakes/in-memory-invoice-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import { planWithoutFeature } from '../fakes/plans';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const EDITOR = 'usr_00000000000000000000000002' as UserId;
const STUDENT = 'stu_00000000000000000000000001' as StudentId;
const DRAFT_CLOCK_ISO = '2026-07-28T10:00:00Z';
const EDIT_CLOCK_ISO = '2026-08-02T09:00:00Z';

describe('UpdateDraftInvoiceLineAmount', () => {
  let invoices: InMemoryInvoiceRepository;

  function build(plan: Plan = PLANS.essentiel): UpdateDraftInvoiceLineAmount {
    return new UpdateDraftInvoiceLineAmount(invoices, fakeClock(EDIT_CLOCK_ISO), new PlanPolicy(plan));
  }

  async function seedDraft(): Promise<{ invoice: Invoice; line: InvoiceLine }> {
    const create = new CreateInvoiceDraft(
      invoices,
      fakeClock(DRAFT_CLOCK_ISO),
      fakeIds(1),
      new PlanPolicy(PLANS.essentiel),
    );
    const { invoice, lines } = await create.execute({
      studentId: STUDENT,
      month: '2026-09',
      lines: [
        {
          formulaId: 'fml_00000000000000000000000001',
          label: { fr: 'Math', ar: 'رياضيات' },
          kind: 'regular',
          amountMad: 20000,
        },
      ],
      centerCode: CENTER,
      deviceOrigin: DEVICE,
      updatedBy: USER,
    });
    return { invoice, line: lines[0]! };
  }

  function validInput(
    overrides: Partial<UpdateDraftInvoiceLineAmountInput> = {},
  ): UpdateDraftInvoiceLineAmountInput {
    return {
      centerCode: CENTER,
      invoiceId: 'inv_00000000000000000000000001',
      lineId: 'invl_00000000000000000000000001',
      amountMad: 15000,
      updatedBy: EDITOR,
      ...overrides,
    };
  }

  beforeEach(() => {
    invoices = new InMemoryInvoiceRepository();
  });

  describe('happy path', () => {
    it('sets the new amount, bumps updatedAt/updatedBy from the Clock, and persists', async () => {
      const { invoice, line } = await seedDraft();

      const updated = await build().execute(
        validInput({ invoiceId: invoice.id, lineId: line.id, amountMad: 15000 }),
      );

      expect(updated.amountMad).toBe(15000);
      expect(updated.updatedAt).toEqual(new Date(EDIT_CLOCK_ISO));
      expect(updated.updatedBy).toBe(EDITOR);
      // Identity, provenance, and the hub's version counter are never touched.
      expect(updated.id).toBe(line.id);
      expect(updated.invoiceId).toBe(invoice.id);
      expect(updated.formulaId).toBe(line.formulaId);
      expect(updated.kind).toBe(line.kind);
      expect(updated.label).toEqual(line.label);
      expect(updated.createdAt).toEqual(line.createdAt);
      expect(updated.version).toBe(line.version);

      const persisted = await invoices.listLines(invoice.id);
      expect(persisted[0]?.amountMad).toBe(15000);
      expect(persisted[0]?.updatedBy).toBe(EDITOR);
    });

    it('accepts an amount above the formula snapshot (arbitrary positive override)', async () => {
      const { invoice, line } = await seedDraft();
      const updated = await build().execute(
        validInput({ invoiceId: invoice.id, lineId: line.id, amountMad: 99900 }),
      );
      expect(updated.amountMad).toBe(99900);
    });

    it('is a no-op when the amount is unchanged (no spurious sync delta)', async () => {
      const { invoice, line } = await seedDraft();

      const updated = await build().execute(
        validInput({ invoiceId: invoice.id, lineId: line.id, amountMad: line.amountMad }),
      );

      expect(updated).toEqual(line);
      const persisted = await invoices.listLines(invoice.id);
      expect(persisted[0]?.updatedAt).toEqual(line.updatedAt);
      expect(persisted[0]?.updatedBy).toBe(USER);
    });
  });

  describe('draft-only guard', () => {
    it('rejects an issued invoice with InvoiceNotDraftError and writes nothing', async () => {
      const { invoice, line } = await seedDraft();
      await new IssueInvoice(invoices, fakeClock(DRAFT_CLOCK_ISO), new PlanPolicy(PLANS.essentiel)).execute(
        { centerCode: CENTER, invoiceId: invoice.id, updatedBy: USER },
      );

      await expect(
        build().execute(validInput({ invoiceId: invoice.id, lineId: line.id })),
      ).rejects.toMatchObject({ code: 'invoice-not-draft', invoiceId: invoice.id, status: 'issued' });
      expect((await invoices.listLines(invoice.id))[0]?.amountMad).toBe(20000);
    });

    it('rejects with the InvoiceNotDraftError type', async () => {
      const { invoice, line } = await seedDraft();
      await new IssueInvoice(invoices, fakeClock(DRAFT_CLOCK_ISO), new PlanPolicy(PLANS.essentiel)).execute(
        { centerCode: CENTER, invoiceId: invoice.id, updatedBy: USER },
      );
      await expect(
        build().execute(validInput({ invoiceId: invoice.id, lineId: line.id })),
      ).rejects.toBeInstanceOf(InvoiceNotDraftError);
    });
  });

  describe('resolution', () => {
    it('throws InvoiceNotFoundError for an unknown invoice', async () => {
      await expect(
        build().execute(validInput({ invoiceId: 'inv_00000000000000000000000099' })),
      ).rejects.toBeInstanceOf(InvoiceNotFoundError);
    });

    it('throws InvoiceNotFoundError for a foreign-center invoice (no cross-tenant edit)', async () => {
      const { invoice, line } = await seedDraft();
      await expect(
        build().execute(
          validInput({ centerCode: OTHER_CENTER, invoiceId: invoice.id, lineId: line.id }),
        ),
      ).rejects.toBeInstanceOf(InvoiceNotFoundError);
    });

    it('throws InvoiceLineNotFoundError for a line id not on the invoice', async () => {
      const { invoice } = await seedDraft();
      await expect(
        build().execute(
          validInput({ invoiceId: invoice.id, lineId: 'invl_00000000000000000000000099' }),
        ),
      ).rejects.toMatchObject({
        code: 'invoice-line-not-found',
        invoiceId: invoice.id,
        lineId: 'invl_00000000000000000000000099' as InvoiceLineId,
      });
    });

    it('throws InvoiceLineNotFoundError for a line belonging to another invoice', async () => {
      const { invoice } = await seedDraft();
      const other = new CreateInvoiceDraft(
        invoices,
        fakeClock(DRAFT_CLOCK_ISO),
        fakeIds(50),
        new PlanPolicy(PLANS.essentiel),
      );
      const { lines } = await other.execute({
        studentId: 'stu_00000000000000000000000002',
        month: '2026-09',
        lines: [
          {
            formulaId: 'fml_00000000000000000000000001',
            label: { fr: 'Math', ar: 'رياضيات' },
            kind: 'regular',
            amountMad: 20000,
          },
        ],
        centerCode: CENTER,
        deviceOrigin: DEVICE,
        updatedBy: USER,
      });

      await expect(
        build().execute(validInput({ invoiceId: invoice.id, lineId: lines[0]!.id })),
      ).rejects.toBeInstanceOf(InvoiceLineNotFoundError);
    });
  });

  describe('validation', () => {
    it.each([0, -100, 150.5])('rejects a non-positive or non-integer amount (%s)', async (amountMad) => {
      const { invoice, line } = await seedDraft();
      await expect(
        build().execute(validInput({ invoiceId: invoice.id, lineId: line.id, amountMad })),
      ).rejects.toThrow();
      expect((await invoices.listLines(invoice.id))[0]?.amountMad).toBe(20000);
    });

    it('rejects a malformed invoice id', async () => {
      await expect(build().execute(validInput({ invoiceId: 'not-an-id' }))).rejects.toThrow();
    });

    it('rejects a malformed line id', async () => {
      const { invoice } = await seedDraft();
      await expect(
        build().execute(validInput({ invoiceId: invoice.id, lineId: 'not-an-id' })),
      ).rejects.toThrow();
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.invoicing', async () => {
      const { invoice, line } = await seedDraft();
      await expect(
        build(planWithoutFeature('core.invoicing')).execute(
          validInput({ invoiceId: invoice.id, lineId: line.id }),
        ),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect((await invoices.listLines(invoice.id))[0]?.amountMad).toBe(20000);
    });
  });
});
