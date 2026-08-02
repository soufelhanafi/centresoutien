import type { InvoiceStatus } from '@centresoutien/domain';
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
  month: string;
  student: string;
  statusLabel: string;
  lifecycleStatus: Record<InvoiceStatus, string>;
  regularSection: string;
  examPrepSection: string;
  subtotal: string;
  total: string;
  paid: string;
  outstanding: string;
  paymentStatusLabel: string;
  paymentStatus: Record<PaymentStatus, string>;
  footer: string;
};

const FR: InvoicePdfLabels = {
  invoiceTitle: 'Facture',
  invoiceNumber: 'N° facture',
  month: 'Mois',
  student: 'Élève',
  statusLabel: 'Statut',
  lifecycleStatus: { draft: 'Brouillon', issued: 'Émise', cancelled: 'Annulée' },
  regularSection: 'Cours réguliers',
  examPrepSection: "Préparation aux examens",
  subtotal: 'Sous-total',
  total: 'Total',
  paid: 'Payé',
  outstanding: 'Solde restant',
  paymentStatusLabel: 'Statut de paiement',
  paymentStatus: { unpaid: 'Non payée', 'partially-paid': 'Partiellement payée', paid: 'Payée' },
  footer: 'Merci de votre confiance.',
};

const AR: InvoicePdfLabels = {
  invoiceTitle: 'فاتورة',
  invoiceNumber: 'رقم الفاتورة',
  month: 'الشهر',
  student: 'التلميذ(ة)',
  statusLabel: 'الحالة',
  lifecycleStatus: { draft: 'مسودة', issued: 'صادرة', cancelled: 'ملغاة' },
  regularSection: 'دروس عادية',
  examPrepSection: 'تحضير الامتحانات',
  subtotal: 'المجموع الفرعي',
  total: 'المجموع',
  paid: 'المدفوع',
  outstanding: 'الرصيد المتبقي',
  paymentStatusLabel: 'حالة الدفع',
  paymentStatus: { unpaid: 'غير مدفوعة', 'partially-paid': 'مدفوعة جزئيًا', paid: 'مدفوعة' },
  footer: 'شكرًا لثقتكم.',
};

export function invoicePdfLabels(locale: 'fr' | 'ar'): InvoicePdfLabels {
  return locale === 'ar' ? AR : FR;
}
