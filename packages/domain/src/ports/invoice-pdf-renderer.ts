import type { InvoiceStatus } from '../entities/invoice';
import type { PaymentStatus } from '../policies/payment-status';

/** One printed line: the bilingual formula label snapshot + its billed amount. */
export type InvoicePdfLine = {
  label: { fr: string; ar: string };
  amountMad: number;
};

/**
 * Everything the invoice PDF needs to lay out a page — assembled by the caller
 * (the `invoice.print` / `invoice.export` IPC handlers) from `ListInvoices`, the
 * center profile, and the student record. This is a plain data contract, not a
 * domain decision: which fields exist here reuses money/status already derived
 * elsewhere (`ListInvoices`, `invoiceTotalMad`); the renderer's only job is
 * typography and layout for the given `locale`.
 */
export type InvoicePdfInput = {
  locale: 'fr' | 'ar';
  invoiceId: string;
  month: string; // 'YYYY-MM'
  status: InvoiceStatus;
  issuedAt: Date | null;
  student: { fr: string; ar: string };
  regularLines: readonly InvoicePdfLine[];
  examPrepLines: readonly InvoicePdfLine[];
  regularSubtotalMad: number;
  examPrepSubtotalMad: number;
  totalMad: number;
  netPaidMad: number;
  outstandingMad: number;
  paymentStatus: PaymentStatus;
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
 * Port for rendering an invoice to a printable PDF (SOU-69). The concrete adapter
 * (`pdf-lib`, desktop-only today) lives in `apps/desktop/src/data/pdf/`; the
 * domain only declares the contract so the composition root can wire it like any
 * other adapter. `render`'s *content* must depend only on `input` — no hidden
 * state beyond the PDF library's own save-time metadata (creation timestamp).
 */
export interface InvoicePdfRenderer {
  render(input: InvoicePdfInput): Promise<Uint8Array>;
}
