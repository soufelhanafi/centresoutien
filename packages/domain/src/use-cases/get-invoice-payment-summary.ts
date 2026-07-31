import type { PaymentReader } from '../ports/payment-repository';
import type { InvoiceRepository } from '../ports/invoice-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { Payment } from '../entities/payment';
import type { InvoiceId } from '../entities/invoice';
import { invoiceTotalMad } from '../policies/invoice-total';
import { derivePaymentStatus, netPaidMad, type PaymentStatus } from '../policies/payment-status';
import { InvoiceNotFoundError } from '../errors/invoice-errors';
import type { CenterCode } from '../value-objects/ids';

export type GetInvoicePaymentSummaryInput = {
  centerCode: CenterCode;
  invoiceId: InvoiceId;
};

export type InvoicePaymentSummary = {
  invoiceId: InvoiceId;
  totalMad: number;
  netPaidMad: number;
  /** `max(0, total − netPaid)` — never negative, so overpayment reads as 0 owed. */
  outstandingMad: number;
  status: PaymentStatus;
  /** The full ledger, oldest first — payments and reversals, for the invoice view. */
  payments: readonly Payment[];
};

/**
 * The read model behind the invoice's payment panel (SOU-93): the total, the net paid,
 * the outstanding balance, the **derived** status, and the ledger. This is the seam
 * SOU-67 deferred — status is computed here from the append-only ledger, never read
 * from a stored scalar. Consumed by the invoice view and the SOU-101 cash desk.
 *
 * Gated by `core.invoicing`. The invoice is resolved center-scoped; an unknown,
 * discarded, or foreign-center id raises {@link InvoiceNotFoundError}.
 */
export class GetInvoicePaymentSummary {
  constructor(
    private readonly payments: PaymentReader,
    private readonly invoices: InvoiceRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetInvoicePaymentSummaryInput): Promise<InvoicePaymentSummary> {
    this.plan.require('core.invoicing');

    const invoice = await this.invoices.findById(input.invoiceId);
    if (invoice === null || invoice.centerCode !== input.centerCode) {
      throw new InvoiceNotFoundError(input.invoiceId);
    }

    const lines = await this.invoices.listLines(input.invoiceId);
    const totalMad = invoiceTotalMad(lines);
    const ledger = await this.payments.listForInvoice(input.invoiceId);
    const net = netPaidMad(ledger);

    return {
      invoiceId: input.invoiceId,
      totalMad,
      netPaidMad: net,
      outstandingMad: Math.max(0, totalMad - net),
      status: derivePaymentStatus(totalMad, ledger),
      payments: ledger,
    };
  }
}
