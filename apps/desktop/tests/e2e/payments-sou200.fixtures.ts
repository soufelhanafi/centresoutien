import type { Page } from '@playwright/test';
import type { Locale } from './payments-cash-desk.fixtures';

/**
 * Black-box fixtures for SOU-200 — cash-desk `/payments` follow-ups:
 *   1. takings payment-count plural forms (FR one/other with 0-as-singular;
 *      AR zero/one/two/few/many/other),
 *   2. locale-correct negative (`Intl`-placed minus) on reversal feed rows,
 *   3. the open-invoice picker as a bounded server-side read (open only,
 *      name search, cursor "load more", page size 20).
 *
 * Driven only through the running packaged app + the public preload bridge
 * (`window.api.invoke`). Every asserted string mirrors `i18n/{fr,ar}.json`'s
 * `payments` namespace exactly (the user-facing localization contract).
 */

/** Extra `payments` copy the SOU-200 specs assert on, mirrored from i18n. */
export const SOU200 = {
  fr: {
    loadMore: 'Afficher plus',
    searchPlaceholder: 'Rechercher un élève…',
    searchLabel: 'Rechercher une facture par élève',
    noResultsTitle: 'Aucun résultat',
    reversal: 'Annulation',
    // takings count — expected rendered string per known count value.
    count: {
      0: '0 paiement',
      1: '1 paiement',
      2: '2 paiements',
      3: '3 paiements',
      11: '11 paiements',
    } as Record<number, string>,
    // the forbidden lazy fallback literal.
    fallbackLiteral: 'paiement(s)',
  },
  ar: {
    loadMore: 'عرض المزيد',
    searchPlaceholder: 'ابحث عن تلميذ…',
    searchLabel: 'ابحث عن فاتورة حسب التلميذ',
    noResultsTitle: 'لا نتائج',
    reversal: 'إلغاء',
    count: {
      0: 'لا دفعات', // zero
      1: 'دفعة واحدة', // one
      2: 'دفعتان', // two (dual)
      3: '3 دفعات', // few (3–10)
      11: '11 دفعة', // many (11–99)
    } as Record<number, string>,
    fallbackLiteral: '',
  },
} as const satisfies Record<Locale, unknown>;

export type Sou200Strings = (typeof SOU200)[Locale];

type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

/** Names used by the picker pagination / search / cancelled-exclusion scenario. */
export const PICKER_NAMES = {
  searchTarget: { fr: 'Farouk Zellij', ar: 'فاروق زليج', tokenFr: 'Zellij', tokenAr: 'زليج' },
  cancelled: { fr: 'Mina Molgha', ar: 'مينا ملغاة' },
} as const;

export type PickerBatch = {
  openCount: number; // total OPEN invoices offered to the picker (batch + searchTarget)
};

/**
 * Seed `batch` open invoices for one center sharing a single subject+formula,
 * plus one distinctly-named search target (open) and one distinctly-named
 * cancelled invoice (must be excluded from the picker). Returns the number of
 * OPEN invoices the picker should surface.
 */
export async function seedPickerBatch(
  win: Page,
  opts: { month: string; batch: number; priceMad: number },
): Promise<PickerBatch> {
  return win.evaluate(
    async ({ month, batch, priceMad, names }) => {
      const api = (window as unknown as { api: Bridge }).api;
      const subject = (await api.invoke('subject.create', { name: { fr: 'Maths', ar: 'رياضيات' } })) as { id: string };
      const formula = (await api.invoke('formula.create', {
        name: { fr: 'Maths seul', ar: 'الرياضيات فقط' },
        subjectIds: [subject.id],
        priceMad: Math.round(priceMad * 100),
        kind: 'regular',
      })) as { id: string };

      const enroll = async (nameFr: string, nameAr: string): Promise<string> => {
        const student = (await api.invoke('student.create', {
          name: { fr: nameFr, ar: nameAr },
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
        return student.id;
      };

      for (let i = 1; i <= batch; i++) {
        const pad = String(i).padStart(2, '0');
        await enroll(`Eleve ${pad}`, `تلميذ ${pad}`);
      }
      await enroll(names.searchTarget.fr, names.searchTarget.ar);
      const cancelledStudentId = await enroll(names.cancelled.fr, names.cancelled.ar);

      await api.invoke('invoice.generateMonthly', { month });

      const cancelledList = (await api.invoke('invoice.list', { studentId: cancelledStudentId })) as {
        invoices: { id: string }[];
      };
      const cancelledInvoice = cancelledList.invoices[0];
      if (!cancelledInvoice) throw new Error('seedPickerBatch: cancelled student has no invoice');
      await api.invoke('invoice.cancel', { invoiceId: cancelledInvoice.id });

      return { openCount: batch + 1 };
    },
    { month: opts.month, batch: opts.batch, priceMad: opts.priceMad, names: PICKER_NAMES },
  );
}

/** Compute the app's own `Intl` currency string for `amount` in the active locale (fr-MA / ar-MA). */
export async function intlMad(win: Page, locale: Locale, amount: number): Promise<string> {
  return win.evaluate(
    ({ lc, amt }) => new Intl.NumberFormat(lc === 'ar' ? 'ar-MA' : 'fr-MA', { style: 'currency', currency: 'MAD' }).format(amt),
    { lc: locale, amt: amount },
  );
}

/** The number of "Encaisser"/"تحصيل" record-actions currently rendered in the picker. */
export async function recordActionCount(win: Page, action: string): Promise<number> {
  return win.getByRole('button', { name: action, exact: true }).count();
}
