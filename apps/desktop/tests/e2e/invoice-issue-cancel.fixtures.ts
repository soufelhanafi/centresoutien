import type { Page } from '@playwright/test';
import { type Locale, type SeededInvoiceSetup, escapeRegExp, seedInvoice } from './invoices.fixtures';

/**
 * Black-box fixtures for SOU-143 — wire invoice.issue / invoice.cancel IPC
 * channels + the renderer's issue/cancel actions on the invoice detail page.
 *
 * Reuses SOU-69's `invoices.fixtures.ts` (`boot`, `gotoInvoices`, `seedInvoice`,
 * `recordFullPayment`, `tryInvoke`, ...) for the shared launch/seed recipe and
 * only adds the copy + helpers specific to the issue/cancel lifecycle actions.
 * Every string mirrored below comes from `i18n/fr.json` / `ar.json`'s
 * `invoices.detail.issue` and `invoices.detail.cancelInvoice` namespaces —
 * the localization contract, not implementation.
 */

export const ISSUE_CANCEL_STR: Record<
  Locale,
  {
    issue: { action: string; success: string };
    cancel: {
      action: string;
      title: string;
      /** Substring present in the no-payments variant, absent from the with-payments variant. */
      bodyNoPayments: string;
      /** Substring present only once a payment exists, ahead of the amount. */
      bodyPaymentsLeadIn: string;
      dismiss: string;
      confirm: string;
      success: string;
    };
  }
> = {
  fr: {
    issue: { action: 'Émettre la facture', success: 'Facture émise.' },
    cancel: {
      action: 'Annuler la facture',
      title: 'Annuler la facture ?',
      bodyNoPayments: 'Cette action est définitive et ne peut pas être annulée.',
      bodyPaymentsLeadIn: 'Cette facture a des paiements enregistrés',
      dismiss: 'Retour',
      confirm: 'Annuler la facture',
      success: 'Facture annulée.',
    },
  },
  ar: {
    issue: { action: 'إصدار الفاتورة', success: 'تم إصدار الفاتورة.' },
    cancel: {
      action: 'إلغاء الفاتورة',
      title: 'إلغاء الفاتورة؟',
      bodyNoPayments: 'هذا الإجراء نهائي ولا يمكن التراجع عنه.',
      bodyPaymentsLeadIn: 'تحتوي هذه الفاتورة على دفعات مسجَّلة',
      dismiss: 'رجوع',
      confirm: 'إلغاء الفاتورة',
      success: 'تم إلغاء الفاتورة.',
    },
  },
};

/**
 * Opens the invoice detail route the same way `invoices-list-detail-print-export.spec.ts`
 * does: only the nested student-name link is clickable, and it is always
 * rendered in French regardless of locale (the Arabic name is a decorative
 * sibling), so the link must always be matched by the French name.
 */
export async function openInvoiceDetail(win: Page, rowName: string, studentNameFr: string): Promise<void> {
  const row = win.getByRole('row', { name: escapeRegExp(rowName) });
  await row.getByRole('link', { name: escapeRegExp(studentNameFr) }).click();
  await win.waitForTimeout(400);
}

/** Seed one draft invoice, then move it to `issued` directly through the bridge (bypasses the UI). */
export async function seedIssuedInvoice(
  win: Page,
  opts: { nameFr: string; nameAr: string; month: string; priceMad: number },
): Promise<SeededInvoiceSetup> {
  const seeded = await seedInvoice(win, opts);
  await win.evaluate(async (invoiceId) => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }).api;
    await api.invoke('invoice.issue', { invoiceId });
  }, seeded.invoiceId);
  return seeded;
}
