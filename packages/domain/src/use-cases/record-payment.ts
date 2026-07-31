import type { PaymentRepository } from '../ports/payment-repository';
import type { InvoiceRepository } from '../ports/invoice-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import { newEnvelope } from '../entities/envelope';
import { PAYMENT_ID_PREFIX, type Payment, type PaymentId } from '../entities/payment';
import type { InvoiceId } from '../entities/invoice';
import { recordPaymentSchema } from '../schemas/payment';
import { invoiceTotalMad } from '../policies/invoice-total';
import { paymentStatusOf, type PaymentStatus } from '../policies/payment-status';
import { InvoiceNotFoundError } from '../errors/invoice-errors';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';

export type RecordPaymentInput = {
  invoiceId: string;
  amountMad: number;
  method: string;
  paidOn: string;
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

export type RecordPaymentResult = {
  payment: Payment;
  /** The invoice's payment status derived after this payment was appended. */
  status: PaymentStatus;
};

/**
 * Records a payment against an invoice by **appending** a `payment` row to the ledger
 * (SOU-93) — there is no status write anywhere. The invoice's paid-ness is always
 * derived from the ledger, so "mark paid" in the UI is just this use case with
 * `amountMad` = the outstanding balance.
 *
 * Order of work:
 *  1. Gate on `core.invoicing` (every plan; the base invoicing feature).
 *  2. Validate the user-derivable fields (`invoiceId` shape, positive integer amount,
 *     method enum, real `paidOn` date).
 *  3. Resolve the invoice center-scoped; an unknown, discarded, or foreign-center id
 *     raises {@link InvoiceNotFoundError} before anything is written.
 *  4. Compute the outstanding balance = invoice total (sum of immutable lines) − net
 *     already paid (`sumForInvoice`). If the amount does **not** cover the full balance,
 *     require `core.invoicing.partial-paid` (Pro+) — on Essentiel a partial payment
 *     throws `PlanFeatureUnavailableError`. An amount that meets or exceeds the balance
 *     (full payment or overpayment) is allowed on every plan.
 *  5. Append the `payment` (fresh envelope, `kind: 'payment'`, `reversesPaymentId: null`)
 *     and return it with the freshly derived status.
 *
 * Nothing here can conflict at sync: the appended row has a unique ULID and is never
 * mutated, so two devices paying the same invoice converge by union.
 */
export class RecordPayment {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly invoices: InvoiceRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: RecordPaymentInput): Promise<RecordPaymentResult> {
    this.plan.require('core.invoicing');
    const fields = recordPaymentSchema.parse(input);

    const invoiceId = fields.invoiceId as InvoiceId;
    const invoice = await this.invoices.findById(invoiceId);
    if (invoice === null || invoice.centerCode !== input.centerCode) {
      throw new InvoiceNotFoundError(invoiceId);
    }

    const lines = await this.invoices.listLines(invoiceId);
    const totalMad = invoiceTotalMad(lines);
    const netBefore = await this.payments.sumForInvoice(invoiceId);
    const outstanding = totalMad - netBefore;

    // Below the full outstanding balance = a partial payment, a Pro-gated feature.
    // Full payment or overpayment (amount >= outstanding) is allowed on every plan.
    if (fields.amountMad < outstanding) {
      this.plan.require('core.invoicing.partial-paid');
    }

    const payment: Payment = {
      id: this.ids.next(PAYMENT_ID_PREFIX) as PaymentId,
      ...newEnvelope(
        {
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        this.clock,
      ),
      invoiceId,
      kind: 'payment',
      amountMad: fields.amountMad,
      method: fields.method,
      paidOn: fields.paidOn,
      reversesPaymentId: null,
    };

    await this.payments.append(payment);
    return { payment, status: paymentStatusOf(totalMad, netBefore + fields.amountMad) };
  }
}
