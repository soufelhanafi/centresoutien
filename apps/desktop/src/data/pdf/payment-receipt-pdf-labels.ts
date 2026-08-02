import type { PaymentKind, PaymentMethod } from '@centresoutien/domain';

/**
 * The payment receipt PDF is rendered entirely in the main/data process, like
 * the invoice and payslip PDFs — its handful of fixed labels are hardcoded
 * here, once, in both languages (see `InvoicePdfLabels`'s doc for why this is
 * the one correct place for that).
 */
export type PaymentReceiptPdfLabels = {
  receiptTitle: string;
  receiptNumber: string;
  kindLabel: Record<PaymentKind, string>;
  invoiceNumber: string;
  month: string;
  student: string;
  amount: string;
  method: Record<PaymentMethod, string>;
  methodLabel: string;
  paidOn: string;
  note: string;
  footer: string;
};

const FR: PaymentReceiptPdfLabels = {
  receiptTitle: 'Reçu de paiement',
  receiptNumber: 'N° reçu',
  kindLabel: { payment: 'Paiement', reversal: 'Annulation' },
  invoiceNumber: 'N° facture',
  month: 'Mois facturé',
  student: 'Élève',
  amount: 'Montant',
  method: { cash: 'Espèces', cheque: 'Chèque', transfer: 'Virement', other: 'Autre' },
  methodLabel: 'Moyen de paiement',
  paidOn: 'Date',
  note: 'Note',
  footer: 'Merci de votre confiance.',
};

const AR: PaymentReceiptPdfLabels = {
  receiptTitle: 'إيصال دفع',
  receiptNumber: 'رقم الإيصال',
  kindLabel: { payment: 'دفعة', reversal: 'إلغاء' },
  invoiceNumber: 'رقم الفاتورة',
  month: 'شهر الفاتورة',
  student: 'التلميذ(ة)',
  amount: 'المبلغ',
  method: { cash: 'نقدًا', cheque: 'شيك', transfer: 'تحويل', other: 'أخرى' },
  methodLabel: 'وسيلة الدفع',
  paidOn: 'التاريخ',
  note: 'ملاحظة',
  footer: 'شكرًا لثقتكم.',
};

export function paymentReceiptPdfLabels(locale: 'fr' | 'ar'): PaymentReceiptPdfLabels {
  return locale === 'ar' ? AR : FR;
}
