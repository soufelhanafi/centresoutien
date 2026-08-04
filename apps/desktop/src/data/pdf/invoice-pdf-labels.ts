import type { PaymentStatus } from '@centresoutien/domain';

/**
 * The invoice PDF is rendered entirely in the main/data process — it never goes
 * through the renderer's `react-i18next` pipeline, so its handful of fixed
 * labels are hardcoded here, once, in both languages. This is the one place in
 * the codebase where that is correct rather than a "no hardcoded strings"
 * violation: there is no i18n boundary crossing for a byte-generated PDF.
 */
export type InvoicePdfLabels = {
  invoiceTitle: string;
  invoiceNumber: string;
  issuedOn: string;
  billedTo: string;
  period: string;
  dueDate: string;
  cancelledStatus: string;
  regularSection: string;
  examPrepSection: string;
  descriptionColumn: string;
  amountColumn: string;
  subtotal: string;
  total: string;
  paid: string;
  outstanding: string;
  paymentStatus: Record<PaymentStatus, string>;
  footer: string;
};

const FR: InvoicePdfLabels = {
  invoiceTitle: 'Facture',
  invoiceNumber: 'N° facture',
  issuedOn: 'Émise le',
  billedTo: 'Facturé à',
  period: 'Période',
  dueDate: 'Échéance',
  cancelledStatus: 'Annulée',
  regularSection: 'Cours réguliers',
  examPrepSection: "Préparation aux examens",
  descriptionColumn: 'Description',
  amountColumn: 'Montant',
  subtotal: 'Sous-total',
  total: 'Total',
  paid: 'Payé',
  outstanding: 'Solde restant',
  paymentStatus: { unpaid: 'Non payée', 'partially-paid': 'Partiellement payée', paid: 'Payée' },
  footer: 'Merci de votre confiance.',
};

const AR: InvoicePdfLabels = {
  invoiceTitle: 'فاتورة',
  invoiceNumber: 'رقم الفاتورة',
  issuedOn: 'أُصدرت في',
  billedTo: 'مفوترة إلى',
  period: 'الفترة',
  dueDate: 'تاريخ الاستحقاق',
  cancelledStatus: 'ملغاة',
  regularSection: 'دروس عادية',
  examPrepSection: 'تحضير الامتحانات',
  descriptionColumn: 'البيان',
  amountColumn: 'المبلغ',
  subtotal: 'المجموع الفرعي',
  total: 'المجموع',
  paid: 'المدفوع',
  outstanding: 'الرصيد المتبقي',
  paymentStatus: { unpaid: 'غير مدفوعة', 'partially-paid': 'مدفوعة جزئيًا', paid: 'مدفوعة' },
  footer: 'شكرًا لثقتكم.',
};

export function invoicePdfLabels(locale: 'fr' | 'ar'): InvoicePdfLabels {
  return locale === 'ar' ? AR : FR;
}
