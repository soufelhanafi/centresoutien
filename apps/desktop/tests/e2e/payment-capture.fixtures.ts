import type { Locator, Page } from '@playwright/test';
import {
  boot,
  gotoInvoices,
  seedInvoice,
  escapeRegExp,
  type Launched,
  type Locale,
  type PlanId,
  type SeededInvoiceSetup,
} from './invoices.fixtures';

/**
 * Black-box fixtures for SOU-101 — Payment capture UI (cash desk, record
 * payment against invoice). Driven exclusively through the running packaged
 * app and the public preload bridge (`window.api.invoke`), reusing SOU-69's
 * `invoices.fixtures.ts` for boot/seed/PDF plumbing since the payment panel
 * lives on the invoice detail route, not a separate screen.
 *
 * Every string asserted on mirrors i18n/fr.json and ar.json's
 * `invoices.detail.payment` namespace exactly, the user-facing localization
 * contract, same as the other suites.
 */

export { boot, gotoInvoices, seedInvoice, escapeRegExp };
export type { Launched, Locale, PlanId, SeededInvoiceSetup };

/** All copy the specs assert on, mirrored from i18n fr/ar.json's `invoices.detail.payment` namespace. */
export const PAY_STR: Record<
  Locale,
  {
    navInvoicing: string;
    status: { unpaid: string; partiallyPaid: string; paid: string };
    payment: {
      panelTitle: string;
      total: string;
      netPaid: string;
      outstanding: string;
      markPaid: string;
      dialogTitle: string;
      amount: string;
      method: string;
      methods: { cash: string; cheque: string; transfer: string; other: string };
      paidOn: string;
      note: string;
      partialLocked: string;
      cancel: string;
      submit: string;
      success: string;
      exceedsBalance: string;
      history: {
        title: string;
        emptyTitle: string;
        emptyBody: string;
        print: string;
        export: string;
        exportSuccess: string;
      };
    };
  }
> = {
  fr: {
    navInvoicing: 'Facturation',
    status: { unpaid: 'Non payée', partiallyPaid: 'Payée partiellement', paid: 'Payée' },
    payment: {
      panelTitle: 'Paiement',
      total: 'Total facturé',
      netPaid: 'Payé',
      outstanding: 'Reste à payer',
      markPaid: 'Marquer payée',
      dialogTitle: 'Enregistrer un paiement',
      amount: 'Montant (MAD)',
      method: 'Moyen de paiement',
      methods: { cash: 'Espèces', cheque: 'Chèque', transfer: 'Virement', other: 'Autre' },
      paidOn: 'Date du paiement',
      note: 'Note (facultatif)',
      partialLocked: 'Le paiement partiel est réservé aux plans Pro et Premium — le montant total est requis.',
      cancel: 'Annuler',
      submit: 'Enregistrer',
      success: 'Paiement enregistré.',
      exceedsBalance: 'Ce montant dépasse le solde restant de la facture.',
      history: {
        title: 'Historique des paiements',
        emptyTitle: 'Aucun paiement',
        emptyBody: 'Les paiements enregistrés apparaîtront ici.',
        print: 'Imprimer le reçu',
        export: 'Exporter le reçu en PDF',
        exportSuccess: 'Reçu exporté avec succès.',
      },
    },
  },
  ar: {
    navInvoicing: 'الفوترة',
    status: { unpaid: 'غير مدفوعة', partiallyPaid: 'مدفوعة جزئيًا', paid: 'مدفوعة' },
    payment: {
      panelTitle: 'الدفع',
      total: 'إجمالي الفاتورة',
      netPaid: 'المدفوع',
      outstanding: 'المتبقي',
      markPaid: 'تحديد كمدفوعة',
      dialogTitle: 'تسجيل دفعة',
      amount: 'المبلغ (درهم)',
      method: 'طريقة الدفع',
      methods: { cash: 'نقدًا', cheque: 'شيك', transfer: 'تحويل بنكي', other: 'أخرى' },
      paidOn: 'تاريخ الدفع',
      note: 'ملاحظة (اختياري)',
      partialLocked: 'الدفع الجزئي متاح فقط في باقتي Pro وPremium — يلزم إدخال المبلغ الكامل.',
      cancel: 'إلغاء',
      submit: 'حفظ',
      success: 'تم تسجيل الدفعة.',
      exceedsBalance: 'هذا المبلغ يتجاوز الرصيد المتبقي من الفاتورة.',
      history: {
        title: 'سجل الدفعات',
        emptyTitle: 'لا توجد دفعات',
        emptyBody: 'ستظهر الدفعات المسجَّلة هنا.',
        print: 'طباعة الإيصال',
        export: 'تصدير الإيصال بصيغة PDF',
        exportSuccess: 'تم تصدير الإيصال بنجاح.',
      },
    },
  },
};

/** Opens the invoice detail route the same way `invoices.fixtures.ts` callers do. */
export async function openInvoiceDetail(win: Page, seeded: SeededInvoiceSetup, locale: Locale): Promise<void> {
  const L = PAY_STR[locale];
  await gotoInvoices(win, { navInvoicing: L.navInvoicing } as never);
  const rowName = locale === 'ar' ? seeded.studentNameAr : seeded.studentNameFr;
  const row = win.getByRole('row', { name: escapeRegExp(rowName) });
  await row.getByRole('link', { name: escapeRegExp(seeded.studentNameFr) }).click();
  await win.waitForTimeout(400);
}

/**
 * Opens the "Enregistrer un paiement" dialog. The trigger button is always
 * labelled `markPaid` regardless of the invoice's current outstanding
 * balance (fresh, partially-paid, or fully paid-off state hides it).
 */
export async function openRecordPaymentDialog(win: Page, L: (typeof PAY_STR)[Locale]): Promise<Locator> {
  await win.getByRole('button', { name: L.payment.markPaid, exact: true }).click();
  await win.waitForTimeout(300);
  return win.getByRole('dialog');
}

export type PaymentFormInput = {
  amountMad?: string;
  note?: string;
};

/** Fills the record-payment dialog's fields without submitting. */
export async function fillPaymentForm(dialog: Locator, input: PaymentFormInput): Promise<void> {
  if (input.amountMad !== undefined) {
    await dialog.locator('input[name="amountMad"]').fill(input.amountMad);
  }
  if (input.note !== undefined) {
    await dialog.locator('textarea[name="note"]').fill(input.note);
  }
}

export async function submitPaymentForm(win: Page, dialog: Locator, L: (typeof PAY_STR)[Locale]): Promise<void> {
  await dialog.getByRole('button', { name: L.payment.submit, exact: true }).click();
  await win.waitForTimeout(700);
}
