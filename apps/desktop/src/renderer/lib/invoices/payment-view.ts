import type { PaymentKind, PaymentMethod, PaymentStatus } from '@centresoutien/domain';

/** One entry of the invoice's append-only payment ledger (SOU-93/SOU-101). */
export type PaymentView = {
  readonly id: string;
  readonly invoiceId: string;
  readonly kind: PaymentKind;
  readonly amountMad: number;
  readonly method: PaymentMethod;
  readonly paidOn: string;
  readonly reversesPaymentId: string | null;
  readonly note: string | null;
  readonly createdAt: string;
};

/** The invoice's total / net paid / outstanding / derived status + the full
 *  ledger, oldest first — backs the payment history list (SOU-101). */
export type InvoicePaymentSummaryView = {
  readonly invoiceId: string;
  readonly totalMad: number;
  readonly netPaidMad: number;
  readonly outstandingMad: number;
  readonly status: PaymentStatus;
  readonly payments: readonly PaymentView[];
};
