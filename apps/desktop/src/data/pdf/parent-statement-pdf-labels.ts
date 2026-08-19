// Fixed FR labels for the consolidated per-parent statement PDF (SOU-284). Like the
// per-student invoice's `invoice-pdf-labels.ts`, the statement is rendered entirely
// in the main/data process and never crosses the renderer's i18n pipeline, so its
// labels are hardcoded here once — the one place a byte-generated PDF's fixed copy is
// not a "no hardcoded strings" violation. FR-only, matching SOU-279 (Arabic dropped
// from the money documents, SOU-271).
//
// Only the statement-specific copy lives here; the shared line-item columns and
// kind-section headings are reused from `invoicePdfLabels` by the section drawers.
export type ParentStatementPdfLabels = {
  title: string;
  billedTo: string;
  childInvoiceNumber: (invoiceId: string) => string;
  noInvoice: string;
  childSubtotal: string;
  grandTotal: string;
  grandTotalDue: string;
  paymentReceived: string;
  balanceDue: string;
  paidBadge: string;
  partialBadge: string;
  unpaidBadge: string;
  cancelledBadge: string;
  footerThanks: string;
  monthLabel: (month: string) => string;
  pageLabel: (page: number, pageCount: number) => string;
};

export const parentStatementPdfLabels: ParentStatementPdfLabels = {
  title: 'Facture',
  billedTo: 'Facturé à',
  childInvoiceNumber: (invoiceId) => `Facture n° ${invoiceId}`,
  noInvoice: 'Aucune facture',
  childSubtotal: "Sous-total de l'élève",
  grandTotal: 'Total général',
  grandTotalDue: 'Total général à régler',
  paymentReceived: 'Règlement reçu',
  balanceDue: 'Solde à régler',
  paidBadge: 'Payée',
  partialBadge: 'Payée partiellement',
  unpaidBadge: 'Non réglée',
  cancelledBadge: 'Annulée',
  footerThanks: 'Merci de votre confiance.',
  monthLabel: (month) => `Mois : ${month}`,
  pageLabel: (page, pageCount) => `Page ${page} / ${pageCount}`,
};
