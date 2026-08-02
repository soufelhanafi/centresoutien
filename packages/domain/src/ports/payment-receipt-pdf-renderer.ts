import type { PaymentKind, PaymentMethod } from '../entities/payment';

/**
 * Everything the payment receipt PDF needs to lay out a page — assembled by
 * {@link GeneratePaymentReceiptPdf} from the resolved `Payment`, its invoice, and
 * the student / center profile. A `reversal` row prints the same layout with its
 * kind labelled distinctly (SOU-101) rather than a separate document — the
 * ledger's append-only shape (payment or reversal, never edited) is exactly what
 * the receipt is a snapshot of.
 */
export type PaymentReceiptPdfInput = {
  locale: 'fr' | 'ar';
  paymentId: string;
  invoiceId: string;
  kind: PaymentKind;
  amountMad: number;
  method: PaymentMethod;
  paidOn: string; // 'YYYY-MM-DD'
  note: string | null;
  month: string; // 'YYYY-MM', the invoice's billed month
  student: { fr: string; ar: string };
  center: {
    name: string;
    address: string;
    phone: string;
    email: string;
    /** Raw image bytes (PNG or JPEG) of the center's logo, or `null` when unset. */
    logoBytes: Uint8Array | null;
  };
};

/**
 * Port for rendering a single payment ledger row to a printable receipt PDF
 * (SOU-101). The concrete adapter (`pdf-lib`, desktop-only today) lives in
 * `apps/desktop/src/data/pdf/`, reusing the invoice PDF adapter's font/layout
 * setup; the domain only declares the contract so the composition root can wire
 * it like any other adapter. `render`'s *content* must depend only on `input` —
 * no hidden state beyond the PDF library's own save-time metadata.
 */
export interface PaymentReceiptPdfRenderer {
  render(input: PaymentReceiptPdfInput): Promise<Uint8Array>;
}
