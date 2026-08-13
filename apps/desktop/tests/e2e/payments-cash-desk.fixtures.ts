import type { Locator, Page } from '@playwright/test';
import {
  boot,
  seedInvoice,
  recordFullPayment,
  tryInvoke,
  escapeRegExp,
  pageCrashed,
  type Launched,
  type Locale,
  type PlanId,
  type SeededInvoiceSetup,
} from './invoices.fixtures';

/**
 * Black-box fixtures for SOU-198 — the `/payments` cash-desk page (today's
 * takings, fast record-payment picker, cross-invoice recent-payments feed).
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer / domain / data implementation is
 * imported. Every string the specs assert on mirrors `i18n/fr.json` /
 * `ar.json`'s `payments` + `invoices.detail.payment` namespaces exactly — the
 * user-facing localization contract, same as the other suites.
 */

export { boot, seedInvoice, recordFullPayment, tryInvoke, escapeRegExp, pageCrashed };
export type { Launched, Locale, PlanId, SeededInvoiceSetup };

export const CASH = {
  fr: {
    nav: 'Paiements',
    title: 'Caisse',
    takings: { title: 'Recette du jour', byMethodLabel: 'Recette du jour par mode de paiement' },
    record: {
      title: 'Enregistrer un paiement',
      action: 'Encaisser',
      search: 'Rechercher un élève…',
      emptyTitle: 'Aucune facture ouverte',
    },
    feed: { title: 'Derniers encaissements', reversal: 'Annulation', emptyTitle: 'Aucun encaissement', unknownStudent: 'Élève inconnu' },
    methods: { cash: 'Espèces', cheque: 'Chèque', transfer: 'Virement', other: 'Autre' },
    dialog: { submit: 'Enregistrer', success: 'Paiement enregistré.' },
    currency: 'MAD',
    editRe: /Modifier|Supprimer/,
  },
  ar: {
    nav: 'المدفوعات',
    title: 'الصندوق',
    takings: { title: 'مداخيل اليوم', byMethodLabel: 'مداخيل اليوم حسب طريقة الأداء' },
    record: {
      title: 'تسجيل دفعة',
      action: 'تحصيل',
      search: 'ابحث عن تلميذ…',
      emptyTitle: 'لا توجد فاتورة مفتوحة',
    },
    feed: { title: 'آخر المقبوضات', reversal: 'إلغاء', emptyTitle: 'لا مقبوضات', unknownStudent: 'تلميذ غير معروف' },
    methods: { cash: 'نقدًا', cheque: 'شيك', transfer: 'تحويل بنكي', other: 'أخرى' },
    dialog: { submit: 'حفظ', success: 'تم تسجيل الدفعة.' },
    currency: 'د.م.',
    editRe: /تعديل|حذف/,
  },
} as const satisfies Record<Locale, unknown>;

export type CashStrings = (typeof CASH)[Locale];

export function nameFor(locale: Locale, seeded: SeededInvoiceSetup): string {
  return locale === 'ar' ? seeded.studentNameAr : seeded.studentNameFr;
}

/** Navigate to the /payments cash-desk page via the sidebar link. */
export async function gotoPayments(win: Page, L: CashStrings): Promise<void> {
  await win.getByRole('link', { name: L.nav, exact: true }).click();
  await win.waitForTimeout(500);
}

/**
 * The visible text of ONLY the "today's takings" block — sliced out of the page
 * text between the takings heading and the next section (the record picker), so
 * the feed's own MAD figures never leak into a takings assertion.
 */
export async function takingsBlockText(win: Page, L: CashStrings): Promise<string> {
  return win.evaluate(
    ({ takingsTitle, recordTitle }) => {
      const text = document.body.innerText;
      const start = text.indexOf(takingsTitle);
      if (start === -1) return '';
      const rest = text.slice(start + takingsTitle.length);
      const end = rest.indexOf(recordTitle);
      return end === -1 ? rest : rest.slice(0, end);
    },
    { takingsTitle: L.takings.title, recordTitle: L.record.title },
  );
}

/**
 * Record a payment from the picker: click the "Encaisser" action for the given
 * open invoice's student, then drive the shared record-payment dialog.
 */
export async function recordViaPicker(
  win: Page,
  L: CashStrings,
  opts: { studentName?: string; amountMad: string },
): Promise<Locator> {
  const trigger = opts.studentName
    ? win
        .getByRole('row', { name: escapeRegExp(opts.studentName) })
        .getByRole('button', { name: L.record.action, exact: true })
        .or(
          win
            .locator('li, tr, div')
            .filter({ hasText: escapeRegExp(opts.studentName) })
            .getByRole('button', { name: L.record.action, exact: true }),
        )
        .first()
    : win.getByRole('button', { name: L.record.action, exact: true }).first();
  await trigger.click();
  await win.waitForTimeout(300);
  const dialog = win.getByRole('dialog');
  await dialog.locator('input[name="amountMad"]').fill(opts.amountMad);
  await dialog.getByRole('button', { name: L.dialog.submit, exact: true }).click();
  await win.waitForTimeout(800);
  return dialog;
}

type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

/** Record a payment directly through the bridge with an explicit paidOn/method. */
export async function seedPayment(
  win: Page,
  args: { invoiceId: string; amountMad: number; method: 'cash' | 'cheque' | 'transfer' | 'other'; paidOn: string },
): Promise<string> {
  return win.evaluate(async (a) => {
    const api = (window as unknown as { api: Bridge }).api;
    const res = (await api.invoke('payment.record', {
      invoiceId: a.invoiceId,
      amountMad: Math.round(a.amountMad * 100),
      method: a.method,
      paidOn: a.paidOn,
    })) as { id: string };
    return res.id;
  }, args);
}

/** The id of the most recent non-reversal payment for an invoice, via payment.recent. */
export async function latestPaymentId(win: Page, invoiceId: string): Promise<string> {
  return win.evaluate(async (id) => {
    const api = (window as unknown as { api: Bridge }).api;
    const res = (await api.invoke('payment.recent', { limit: 200 })) as {
      payments: { id: string; invoiceId: string; kind: string }[];
    };
    const row = res.payments.find((p) => p.invoiceId === id && p.kind === 'payment');
    if (!row) throw new Error('latestPaymentId: no payment row found for invoice');
    return row.id;
  }, invoiceId);
}

/** Append a reversal for a payment through the bridge (payment.void). */
export async function voidPayment(win: Page, paymentId: string): Promise<void> {
  await win.evaluate(
    async ({ id, paidOn }) => {
      const api = (window as unknown as { api: Bridge }).api;
      await api.invoke('payment.void', { paymentId: id, paidOn });
    },
    { id: paymentId, paidOn: todayIso() },
  );
}

/**
 * Today's LOCAL business day as 'YYYY-MM-DD', mirroring the renderer's `today.ts`
 * (getFullYear/getMonth/getDate) — the day `getDayTakings` nets by. Every seeded and
 * voided `paidOn` uses this so fixtures model the same business day the cash-desk UI
 * shows, with no UTC/local drift near midnight (SOU-244). This is the business date,
 * not the UTC envelope clock.
 */
export function todayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** The billing month (YYYY-MM) of today — keeps the seeded invoice coherent with "today". */
export function currentMonth(): string {
  return todayIso().slice(0, 7);
}
