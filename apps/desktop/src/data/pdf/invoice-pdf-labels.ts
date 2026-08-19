/**
 * The invoice PDF is rendered entirely in the main/data process — it never goes
 * through the renderer's `react-i18next` pipeline, so its fixed labels are
 * hardcoded here, once. This is the one place in the codebase where that is
 * correct rather than a "no hardcoded strings" violation: there is no i18n
 * boundary crossing for a byte-generated PDF.
 *
 * FR-only (SOU-279): Arabic has been dropped from the invoice (SOU-271), so
 * there is no AR counterpart and no RTL mirror here.
 */
export type InvoicePdfLabels = {
  invoiceTitle: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  billedTo: string;
  parentOf: (student: string) => string;
  regularSection: string;
  examPrepSection: string;
  descriptionColumn: string;
  amountColumn: string;
  subtotal: string;
  total: string;
  totalDue: string;
  paymentReceived: string;
  balanceDue: string;
  paidBadge: string;
  partialBadge: string;
  draftBadge: string;
  cancelledBadge: string;
  bannerUnpaid: (total: string, dueDate: string) => string;
  bannerPartial: (balance: string) => string;
  bannerPaid: (total: string) => string;
  bannerCancelled: string;
  footerThanks: string;
  pageLabel: (page: number, pageCount: number) => string;
};

export const invoicePdfLabels: InvoicePdfLabels = {
  invoiceTitle: 'Facture',
  invoiceNumber: 'Numéro de facture',
  issueDate: "Date d'émission",
  dueDate: "Date d'échéance",
  billedTo: 'Facturé à',
  parentOf: (student) => `Parent de : ${student}`,
  regularSection: 'Soutien régulier',
  examPrepSection: 'Préparation aux examens',
  descriptionColumn: 'Description',
  amountColumn: 'Montant',
  subtotal: 'Sous-total',
  total: 'Total',
  totalDue: 'Total à régler',
  paymentReceived: 'Règlement reçu',
  balanceDue: 'Solde à régler',
  paidBadge: 'Payée',
  partialBadge: 'Payée partiellement',
  draftBadge: 'Brouillon',
  cancelledBadge: 'Annulée',
  bannerUnpaid: (total, dueDate) => `${total} à régler avant le ${dueDate}`,
  bannerPartial: (balance) => `${balance} restant à régler`,
  bannerPaid: (total) => `${total} réglés`,
  bannerCancelled: 'Facture annulée',
  footerThanks: 'Merci de votre confiance.',
  pageLabel: (page, pageCount) => `Page ${page} / ${pageCount}`,
};
