import type { Page } from '@playwright/test';
import { CASH, boot, pageCrashed, todayIso, currentMonth, type CashStrings, type Launched, type Locale } from './payments-cash-desk.fixtures';

/**
 * Black-box fixtures for the SOU-220 integration branch (Paiements
 * consolidation: SOU-223 dashboard day-takings, SOU-224 Impayés-as-tab +
 * /arrears removal, SOU-225 encaissements date/method filters).
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer/domain/data implementation is
 * imported. Every string these specs assert on mirrors `i18n/{fr,ar}.json`'s
 * `payments` + `dashboard` + `arrears` namespaces — the user-facing
 * localization contract, exactly as the sibling suites do.
 */

export { CASH, boot, pageCrashed, todayIso, currentMonth };
export type { CashStrings, Launched, Locale };

/** Method-select + date-range filter copy for the Derniers encaissements feed, mirrored from `payments.feed.filters` (SOU-225). */
export const FEED_FILTERS = {
  fr: { from: 'Du', to: 'Au', method: 'Moyen de paiement', allMethods: 'Tous les moyens', reset: 'Réinitialiser', noResultsTitle: 'Aucun encaissement trouvé' },
  ar: { from: 'من', to: 'إلى', method: 'طريقة الدفع', allMethods: 'كل الطرق', reset: 'إعادة الضبط', noResultsTitle: 'لا توجد مقبوضات' },
} as const satisfies Record<Locale, unknown>;

export type FeedFilterStrings = (typeof FEED_FILTERS)[Locale];

/** Dashboard "Argent" card-group copy the SOU-223 spec asserts on, mirrored from i18n. */
export const DASH = {
  fr: { nav: 'Tableau de bord', argentSection: 'Argent', takingsTitle: 'Recette du jour', currency: 'MAD' },
  ar: { nav: 'لوحة القيادة', argentSection: 'المالية', takingsTitle: 'مداخيل اليوم', currency: 'د.م.' },
} as const satisfies Record<Locale, unknown>;

export type DashStrings = (typeof DASH)[Locale];

export type PaymentMethod = 'cash' | 'cheque' | 'transfer' | 'other';

export type FeedSeedEntry = {
  nameFr: string;
  nameAr: string;
  method: PaymentMethod;
  amountMad: number;
  /** Business day 'YYYY-MM-DD' the payment is recorded on. */
  paidOn: string;
};

export type FeedSeedResult = { studentIds: string[] };

type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

/**
 * Seed one shared subject + regular formula, then one student + active
 * subscription + issued invoice + a single recorded payment per entry (with the
 * entry's method + paidOn). Distinct student names let the specs assert
 * feed-row presence/absence by name after applying a method or date filter.
 */
export async function seedFeedPayments(win: Page, month: string, entries: readonly FeedSeedEntry[]): Promise<FeedSeedResult> {
  return win.evaluate(
    async ({ month, entries }) => {
      const api = (window as unknown as { api: Bridge }).api;
      const subject = (await api.invoke('subject.create', { name: { fr: 'Maths', ar: 'رياضيات' } })) as { id: string };
      const formula = (await api.invoke('formula.create', {
        name: { fr: 'Maths seul', ar: 'الرياضيات فقط' },
        subjectIds: [subject.id],
        priceMad: 50000,
        kind: 'regular',
      })) as { id: string };

      const studentIds: string[] = [];
      for (const entry of entries) {
        const student = (await api.invoke('student.create', {
          name: { fr: entry.nameFr, ar: entry.nameAr },
          birthDate: '2010-05-14',
          level: '3AC',
        })) as { id: string };
        await api.invoke('subscription.create', {
          studentId: student.id,
          formulaId: formula.id,
          kind: 'regular',
          subjectIds: [subject.id],
          startMonth: month,
        });
        studentIds.push(student.id);
      }

      await api.invoke('invoice.generateMonthly', { month });

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const studentId = studentIds[i];
        if (!entry || studentId === undefined) continue;
        const list = (await api.invoke('invoice.list', { studentId })) as { invoices: { id: string }[] };
        const invoice = list.invoices[0];
        if (!invoice) throw new Error('seedFeedPayments: no invoice drafted for student');
        await api.invoke('invoice.issue', { invoiceId: invoice.id });
        await api.invoke('payment.record', {
          invoiceId: invoice.id,
          amountMad: Math.round(entry.amountMad * 100),
          method: entry.method,
          paidOn: entry.paidOn,
        });
      }

      return { studentIds };
    },
    { month, entries: [...entries] },
  );
}

/** Seed one issued invoice + a full cash payment today, so the dashboard day-takings figure is non-zero. Returns the paid amount (MAD). */
export async function seedTodayCashTakings(win: Page, month: string, paidOn: string, amountMad: number): Promise<number> {
  await win.evaluate(
    async ({ month, paidOn, amountMad }) => {
      const api = (window as unknown as { api: Bridge }).api;
      const subject = (await api.invoke('subject.create', { name: { fr: 'Maths', ar: 'رياضيات' } })) as { id: string };
      const formula = (await api.invoke('formula.create', {
        name: { fr: 'Maths seul', ar: 'الرياضيات فقط' },
        subjectIds: [subject.id],
        priceMad: Math.round(amountMad * 100),
        kind: 'regular',
      })) as { id: string };
      const student = (await api.invoke('student.create', {
        name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
        birthDate: '2010-05-14',
        level: '3AC',
      })) as { id: string };
      await api.invoke('subscription.create', {
        studentId: student.id,
        formulaId: formula.id,
        kind: 'regular',
        subjectIds: [subject.id],
        startMonth: month,
      });
      await api.invoke('invoice.generateMonthly', { month });
      const list = (await api.invoke('invoice.list', { studentId: student.id })) as { invoices: { id: string }[] };
      const invoice = list.invoices[0];
      if (!invoice) throw new Error('seedTodayCashTakings: no invoice drafted');
      await api.invoke('invoice.issue', { invoiceId: invoice.id });
      await api.invoke('payment.record', { invoiceId: invoice.id, amountMad: Math.round(amountMad * 100), method: 'cash', paidOn });
    },
    { month, paidOn, amountMad },
  );
  return amountMad;
}

/** The app's own `Intl` MAD string for `amount` in the active locale (fr-MA / ar-MA) — matches the renderer's formatter. */
export async function intlMad(win: Page, locale: Locale, amount: number): Promise<string> {
  return win.evaluate(
    ({ lc, amt }) => new Intl.NumberFormat(lc === 'ar' ? 'ar-MA' : 'fr-MA', { style: 'currency', currency: 'MAD' }).format(amt),
    { lc: locale, amt: amount },
  );
}

/**
 * Whitespace/bidi-normalize a rendered figure so NBSP (U+00A0) and the LRM/RLM/ALM
 * bidi marks (U+200E/U+200F/U+061C) `Intl` injects never cause a false mismatch.
 * Built from char codes so the source carries no irregular-whitespace literals.
 */
export function normalizeWs(s: string | null): string {
  const marks = [0x200e, 0x200f, 0x061c, 0x00a0].map((code) => String.fromCharCode(code)).join('');
  const bidiAndNbsp = new RegExp(`[${marks}]`, 'g');
  return (s ?? '').replace(bidiAndNbsp, ' ').replace(/\s+/g, ' ').trim();
}

/** `YYYY-MM-DD` for `n` days before/after today (n<0 = past). */
export function dayOffsetIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
