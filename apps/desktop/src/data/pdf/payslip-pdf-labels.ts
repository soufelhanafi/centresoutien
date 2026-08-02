import type { TeacherPayoutStatus, TeacherPayrollRuleKind } from '@centresoutien/domain';

/**
 * The payslip PDF is rendered entirely in the main/data process, like the
 * invoice PDF — its handful of fixed labels are hardcoded here, once, in both
 * languages (see `InvoicePdfLabels`'s doc for why this is the one correct place
 * for that).
 */
export type PayslipPdfLabels = {
  payslipTitle: string;
  payoutNumber: string;
  month: string;
  teacher: string;
  statusLabel: string;
  lifecycleStatus: Record<TeacherPayoutStatus, string>;
  ruleLabel: Record<TeacherPayrollRuleKind, string>;
  baseAmount: string;
  percent: string;
  total: string;
  notes: string;
  signatureLine: string;
  footer: string;
};

const FR: PayslipPdfLabels = {
  payslipTitle: 'Bulletin de paie',
  payoutNumber: 'N° bulletin',
  month: 'Mois',
  teacher: 'Enseignant(e)',
  statusLabel: 'Statut',
  lifecycleStatus: { draft: 'Brouillon', paid: 'Payé' },
  ruleLabel: {
    'fixed-monthly': 'Montant fixe mensuel',
    'percentage-of-monthly-fees': 'Pourcentage des frais mensuels',
  },
  baseAmount: 'Base attribuée',
  percent: 'Pourcentage',
  total: 'Total à payer',
  notes: 'Remarques',
  signatureLine: "Signature de l'enseignant(e)",
  footer: 'Document généré par Centre Soutien.',
};

const AR: PayslipPdfLabels = {
  payslipTitle: 'كشف الراتب',
  payoutNumber: 'رقم الكشف',
  month: 'الشهر',
  teacher: 'الأستاذ(ة)',
  statusLabel: 'الحالة',
  lifecycleStatus: { draft: 'مسودة', paid: 'مدفوع' },
  ruleLabel: {
    'fixed-monthly': 'مبلغ شهري ثابت',
    'percentage-of-monthly-fees': 'نسبة من الرسوم الشهرية',
  },
  baseAmount: 'الأساس المسند',
  percent: 'النسبة',
  total: 'المجموع المستحق',
  notes: 'ملاحظات',
  signatureLine: 'توقيع الأستاذ(ة)',
  footer: 'وثيقة صادرة عن Centre Soutien.',
};

export function payslipPdfLabels(locale: 'fr' | 'ar'): PayslipPdfLabels {
  return locale === 'ar' ? AR : FR;
}
