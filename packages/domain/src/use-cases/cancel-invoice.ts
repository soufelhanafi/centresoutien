import type { InvoiceRepository } from '../ports/invoice-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import { applyWrite } from '../entities/write';
import { canTransitionInvoice } from '../policies/invoice-status';
import { InvalidInvoiceTransitionError, InvoiceNotFoundError } from '../errors/invoice-errors';
import type { Invoice, InvoiceId } from '../entities/invoice';
import type { CenterCode, UserId } from '../value-objects/ids';

export type CancelInvoiceInput = {
  centerCode: CenterCode;
  invoiceId: InvoiceId;
  updatedBy: UserId;
};

/**
 * Cancels an invoice: `draft → cancelled` (discard a draft) or `issued → cancelled`
 * (void an issued invoice). Gated by `core.invoicing`. `cancelled` is terminal — a
 * correction is a *new* invoice, never a re-open of this one, so cancelling an
 * already-cancelled invoice raises {@link InvalidInvoiceTransitionError}.
 *
 * Cancelling never rewrites the frozen lines; it only advances the header status.
 * The target is center-scoped: an unknown, already-discarded, or foreign-center id
 * raises {@link InvoiceNotFoundError} before anything is touched (mirrors
 * `ArchiveGroup`).
 *
 * `cancelledAt` is stamped from the injected Clock (UTC). Identity/provenance and
 * `version` are never touched. The write goes through `applyWrite`, which advances
 * `updatedAt`/`updatedBy` and records the changed fields.
 */
export class CancelInvoice {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CancelInvoiceInput): Promise<Invoice> {
    this.plan.require('core.invoicing');

    const existing = await this.invoices.findById(input.invoiceId);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new InvoiceNotFoundError(input.invoiceId);
    }

    if (!canTransitionInvoice(existing.status, 'cancelled')) {
      throw new InvalidInvoiceTransitionError(input.invoiceId, existing.status, 'cancelled');
    }

    const { next } = applyWrite(
      existing,
      { status: 'cancelled', cancelledAt: this.clock.now() },
      { clock: this.clock, updatedBy: input.updatedBy },
    );
    await this.invoices.save(next);
    return next;
  }
}
