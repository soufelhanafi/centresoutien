import type { InvoiceRepository } from '../ports/invoice-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import { applyWrite } from '../entities/write';
import { updateDraftInvoiceLineAmountSchema } from '../schemas/invoice';
import {
  InvoiceLineNotFoundError,
  InvoiceNotDraftError,
  InvoiceNotFoundError,
} from '../errors/invoice-errors';
import type { InvoiceId } from '../entities/invoice';
import type { InvoiceLine, InvoiceLineId } from '../entities/invoice-line';
import type { CenterCode, UserId } from '../value-objects/ids';

export type UpdateDraftInvoiceLineAmountInput = {
  centerCode: CenterCode;
  invoiceId: string;
  lineId: string;
  amountMad: number;
  updatedBy: UserId;
};

/**
 * The director's override of a draft line's billed amount (SOU-289). Gated by
 * `core.invoicing`. Draft-only: this is the one window in which a line's
 * `amountMad` may deviate from the formula snapshot — once the invoice is
 * `issued` (or `cancelled`) the line is frozen and this use case rejects with
 * {@link InvoiceNotDraftError}.
 *
 * The header is resolved first, center-scoped — an unknown, tombstoned, or
 * foreign-center invoice raises {@link InvoiceNotFoundError}; a line id with no
 * live row on that invoice raises {@link InvoiceLineNotFoundError}. The amount is
 * validated by `updateDraftInvoiceLineAmountSchema` (strictly positive integer
 * centimes). The write goes through `applyWrite` (advances `updatedAt`/`updatedBy`
 * from the Clock, never `version`) and persists via the draft-only
 * `updateDraftLineAmount` port method; an unchanged amount is a no-op that writes
 * nothing (no spurious sync delta).
 */
export class UpdateDraftInvoiceLineAmount {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: UpdateDraftInvoiceLineAmountInput): Promise<InvoiceLine> {
    this.plan.require('core.invoicing');
    const fields = updateDraftInvoiceLineAmountSchema.parse(input);
    const invoiceId = fields.invoiceId as InvoiceId;
    const lineId = fields.lineId as InvoiceLineId;

    const invoice = await this.invoices.findById(invoiceId);
    if (invoice === null || invoice.centerCode !== input.centerCode) {
      throw new InvoiceNotFoundError(invoiceId);
    }
    if (invoice.status !== 'draft') {
      throw new InvoiceNotDraftError(invoiceId, invoice.status);
    }

    const lines = await this.invoices.listLines(invoiceId);
    const line = lines.find((candidate) => candidate.id === lineId);
    if (line === undefined) {
      throw new InvoiceLineNotFoundError(invoiceId, lineId);
    }

    const { next, changedFields } = applyWrite(
      line,
      { amountMad: fields.amountMad },
      { clock: this.clock, updatedBy: input.updatedBy },
    );
    if (changedFields.length > 0) {
      await this.invoices.updateDraftLineAmount(next);
    }
    return next;
  }
}
