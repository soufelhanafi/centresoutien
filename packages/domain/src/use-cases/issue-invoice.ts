import type { InvoiceRepository } from '../ports/invoice-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import { applyWrite } from '../entities/write';
import { canTransitionInvoice } from '../policies/invoice-status';
import { InvalidInvoiceTransitionError, InvoiceNotFoundError } from '../errors/invoice-errors';
import type { Invoice, InvoiceId } from '../entities/invoice';
import type { CenterCode, UserId } from '../value-objects/ids';

export type IssueInvoiceInput = {
  centerCode: CenterCode;
  invoiceId: InvoiceId;
  updatedBy: UserId;
};

/**
 * Issues a draft invoice: `draft → issued` (SOU-67). Gated by `core.invoicing`.
 * Once issued, the invoice and its lines are frozen — the only remaining legal move
 * is `issued → cancelled`; there is no path back to `draft` and no line-edit path.
 *
 * The target is center-scoped: the header is loaded first, and an unknown,
 * already-discarded, or foreign-center id raises {@link InvoiceNotFoundError} before
 * anything is touched (mirrors `ArchiveGroup`). The transition itself is checked
 * against the state machine — issuing an already-issued or cancelled invoice raises
 * {@link InvalidInvoiceTransitionError}.
 *
 * `issuedAt` is stamped from the injected Clock (UTC). Identity/provenance
 * (`id`, `centerCode`, `deviceOrigin`, `createdAt`) and `version` are never touched —
 * `version` is the hub's to assign. The write goes through `applyWrite`, which
 * advances `updatedAt`/`updatedBy` and records the changed fields.
 */
export class IssueInvoice {
  constructor(
    private readonly invoices: InvoiceRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: IssueInvoiceInput): Promise<Invoice> {
    this.plan.require('core.invoicing');

    const existing = await this.invoices.findById(input.invoiceId);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new InvoiceNotFoundError(input.invoiceId);
    }

    if (!canTransitionInvoice(existing.status, 'issued')) {
      throw new InvalidInvoiceTransitionError(input.invoiceId, existing.status, 'issued');
    }

    const { next } = applyWrite(
      existing,
      { status: 'issued', issuedAt: this.clock.now() },
      { clock: this.clock, updatedBy: input.updatedBy },
    );
    await this.invoices.save(next);
    return next;
  }
}
