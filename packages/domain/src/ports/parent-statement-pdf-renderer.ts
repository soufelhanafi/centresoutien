import type { InvoiceStatus } from '../entities/invoice';
import type { PaymentStatus } from '../policies/payment-status';

/** One printed line of a child block: the bilingual formula label + its amount. */
export type ParentStatementPdfLine = {
  label: { fr: string; ar: string };
  amountMad: number;
};

/** One child block of the consolidated statement — the child's own invoice number
 *  (`invoiceId`, `null` → « Aucune facture »), its kind-grouped lines with subtotals,
 *  and the child's own derived total/received/outstanding/status. */
export type ParentStatementPdfChild = {
  childName: { fr: string; ar: string };
  invoiceId: string | null;
  invoiceStatus: InvoiceStatus | null;
  paymentStatus: PaymentStatus;
  regularLines: readonly ParentStatementPdfLine[];
  examPrepLines: readonly ParentStatementPdfLine[];
  regularSubtotalMad: number;
  examPrepSubtotalMad: number;
  childTotalMad: number;
  childNetPaidMad: number;
  childOutstandingMad: number;
};

/**
 * Everything the Facture groupée PDF needs to lay out — assembled by the caller
 * (the `parentStatement.print` / `parentStatement.export` IPC handlers) from
 * `GetParentMonthlyStatement`, the center profile, and the guardian record. A plain
 * data contract, not a domain decision: the money/status here is already derived
 * (`aggregateParentStatement`, `paymentStatusOf`); the renderer's only job is
 * typography and layout. Sibling of {@link InvoicePdfInput} — the per-student
 * invoice contract is left untouched (SOU-279).
 */
export type ParentStatementPdfInput = {
  locale: 'fr' | 'ar';
  /** The responsible guardian's name — the statement header's addressee. */
  parentName: string;
  month: string; // 'YYYY-MM'
  children: readonly ParentStatementPdfChild[];
  grandTotalMad: number;
  totalReceivedMad: number;
  outstandingMad: number;
  aggregateStatus: PaymentStatus;
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
 * Port for rendering a consolidated per-parent monthly statement to a printable PDF
 * (SOU-284). The concrete adapter (`pdf-lib`, desktop-only today) lives in
 * `apps/desktop/src/data/pdf/`; the domain only declares the contract so the
 * composition root can wire it like any other adapter. `render`'s *content* must
 * depend only on `input` — no hidden state beyond the PDF library's own save-time
 * metadata (creation timestamp). Distinct from {@link InvoicePdfRenderer}, which
 * stays the single-student invoice path and is not reused for this document.
 */
export interface ParentStatementPdfRenderer {
  render(input: ParentStatementPdfInput): Promise<Uint8Array>;
}
