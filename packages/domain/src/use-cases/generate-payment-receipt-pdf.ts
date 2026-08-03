import type { PaymentRepository } from '../ports/payment-repository';
import type { InvoiceRepository } from '../ports/invoice-repository';
import type { PaymentReceiptPdfRenderer } from '../ports/payment-receipt-pdf-renderer';
import type { GetCenterProfile } from './get-center-profile';
import type { ReadCenterLogo } from './read-center-logo';
import type { GetStudent } from './get-student';
import type { PlanPolicy } from '../plans/plan-policy';
import type { PaymentId } from '../entities/payment';
import type { CenterCode } from '../value-objects/ids';
import { PaymentNotFoundError } from '../errors/payment-errors';
import { InvoiceNotFoundError } from '../errors/invoice-errors';

export type GeneratePaymentReceiptPdfInput = {
  centerCode: CenterCode;
  paymentId: PaymentId;
  locale: 'fr' | 'ar';
};

export type GeneratePaymentReceiptPdfResult = {
  /** The resolved, tenant-verified payment id — safe to use in a filename,
   *  unlike echoing back `input.paymentId` unvalidated. */
  paymentId: PaymentId;
  bytes: Uint8Array;
};

/**
 * Renders a single ledger row (a `payment` or a `reversal`) to a printable
 * receipt PDF (SOU-101 KICKOFF) — mirrors {@link GeneratePayslipPdf}'s shape:
 * resolve the tenant-scoped aggregate, its dependents, and the center profile,
 * then hand a plain DTO to the renderer port. Stateless: printing a receipt
 * never mutates the append-only ledger.
 *
 * The payment's invoice is resolved for its `month`; the student name falls
 * back to an em dash rather than throwing when the student has since been
 * archived or deleted, the same graceful degradation `buildInvoicePdfInput`
 * uses for the invoice PDF — a receipt for a student no longer on file should
 * still be reprintable. Gated by `core.invoicing` (every plan).
 */
export class GeneratePaymentReceiptPdf {
  constructor(
    private readonly payments: Pick<PaymentRepository, 'findById'>,
    private readonly invoices: Pick<InvoiceRepository, 'findById'>,
    private readonly getStudent: Pick<GetStudent, 'execute'>,
    private readonly getCenterProfile: Pick<GetCenterProfile, 'execute'>,
    private readonly readCenterLogo: Pick<ReadCenterLogo, 'execute'>,
    private readonly renderer: Pick<PaymentReceiptPdfRenderer, 'render'>,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GeneratePaymentReceiptPdfInput): Promise<GeneratePaymentReceiptPdfResult> {
    this.plan.require('core.invoicing');

    const payment = await this.payments.findById(input.paymentId);
    if (payment === null || payment.centerCode !== input.centerCode) {
      throw new PaymentNotFoundError(input.paymentId);
    }

    const invoice = await this.invoices.findById(payment.invoiceId);
    if (invoice === null || invoice.centerCode !== input.centerCode) {
      throw new InvoiceNotFoundError(payment.invoiceId);
    }

    const [student, center] = await Promise.all([
      this.getStudent.execute({ centerCode: input.centerCode, id: invoice.studentId }),
      this.getCenterProfile.execute(),
    ]);
    const logoBytes = center?.logoPath ? await this.readCenterLogo.execute({ path: center.logoPath }) : null;

    const bytes = await this.renderer.render({
      locale: input.locale,
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      kind: payment.kind,
      amountMad: payment.amountMad,
      method: payment.method,
      paidOn: payment.paidOn,
      note: payment.note,
      month: invoice.month,
      student: student ? { fr: student.name.fr, ar: student.name.ar } : { fr: '—', ar: '—' },
      center: {
        name: center?.name ?? '',
        address: center?.address ?? '',
        phone: center?.phone ?? '',
        email: center?.email ?? '',
        logoBytes,
      },
    });

    return { paymentId: payment.id, bytes };
  }
}
