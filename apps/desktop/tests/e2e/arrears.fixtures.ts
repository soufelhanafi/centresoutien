import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-103 — Impayés (arrears) view: overdue/partial
 * invoices grouped by parent, filters, aging summary, follow-up quick actions.
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer/domain/data implementation is
 * imported. Every string the specs assert on mirrors `i18n/fr.json` /
 * `ar.json`'s `arrears` namespace, the user-facing localization contract, same
 * as the other suites.
 *
 * Launch switches (documented, shared with the other suites):
 *   - CS_LOCALE       → renderer locale (fr | ar)
 *   - CS_PLAN         → active plan (essentiel | pro | premium)
 *   - --user-data-dir → throwaway Electron userData dir (fresh first run)
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

/** All copy the specs assert on, mirrored from i18n fr/ar.json's `arrears` namespace (plus the shared `invoices.status.*` and payment-dialog copy the quick actions reuse). */
export const STR: Record<
  Locale,
  {
    navArrears: string;
    navInvoicing: string;
    title: string;
    subtitle: string;
    actions: { exportList: string; recordPayment: string; openInvoice: string };
    filters: {
      monthLabel: string;
      amountMinLabel: string;
      amountMaxLabel: string;
      groupLabel: string;
      groupAll: string;
      statusLabel: string;
      statusAll: string;
    };
    aging: { groupLabel: string; bucket: { '30': string; '60': string; ninetyPlus: string }; total: string };
    table: { student: string; month: string; aging: string; amount: string; status: string; actions: string };
    parentCard: { totalOutstanding: string; unlinkedParent: string };
    empty: { title: string; body: string };
    noResults: { title: string; body: string };
    loadError: { title: string; body: string; retry: string };
    print: { title: string };
    status: { unpaid: string; partiallyPaid: string; paid: string };
    payment: { dialogTitle: string; amount: string; submit: string; success: string };
  }
> = {
  fr: {
    navArrears: 'Impayés',
    navInvoicing: 'Facturation',
    title: 'Impayés',
    subtitle: 'Factures en retard ou partiellement payées, regroupées par parent, pour vos relances téléphoniques.',
    actions: {
      exportList: 'Exporter la liste en PDF',
      recordPayment: 'Enregistrer un paiement',
      openInvoice: 'Ouvrir la facture',
    },
    filters: {
      monthLabel: 'Filtrer par mois',
      amountMinLabel: 'Montant minimum dû (MAD)',
      amountMaxLabel: 'Montant maximum dû (MAD)',
      groupLabel: 'Filtrer par groupe',
      groupAll: 'Tous les groupes',
      statusLabel: 'Filtrer par statut de paiement',
      statusAll: 'Tous les statuts',
    },
    aging: {
      groupLabel: "Résumé de l'ancienneté des impayés",
      bucket: { '30': '1 à 30 jours', '60': '31 à 60 jours', ninetyPlus: '61 jours et plus' },
      total: 'Total dû',
    },
    table: { student: 'Élève', month: 'Mois', aging: 'Ancienneté', amount: 'Montant dû', status: 'Statut', actions: 'Actions' },
    parentCard: { totalOutstanding: 'Total dû', unlinkedParent: 'Parent non renseigné' },
    empty: { title: 'Aucun impayé', body: 'Bonne nouvelle : tous les paiements sont à jour.' },
    noResults: { title: 'Aucun résultat', body: 'Aucun impayé ne correspond à ces filtres.' },
    loadError: { title: 'Chargement impossible', body: 'Le chargement des impayés a échoué.', retry: 'Réessayer' },
    print: { title: 'Liste des impayés — relances téléphoniques' },
    status: { unpaid: 'Non payée', partiallyPaid: 'Payée partiellement', paid: 'Payée' },
    payment: { dialogTitle: 'Enregistrer un paiement', amount: 'Montant (MAD)', submit: 'Enregistrer', success: 'Paiement enregistré.' },
  },
  ar: {
    navArrears: 'المتأخرات',
    navInvoicing: 'الفوترة',
    title: 'المتأخرات',
    subtitle: 'الفواتير المتأخرة أو المدفوعة جزئيًا، مجمّعة حسب ولي الأمر، لمتابعاتكم الهاتفية.',
    actions: {
      exportList: 'تصدير القائمة بصيغة PDF',
      recordPayment: 'تسجيل دفعة',
      openInvoice: 'فتح الفاتورة',
    },
    filters: {
      monthLabel: 'التصفية حسب الشهر',
      amountMinLabel: 'الحد الأدنى للمبلغ المستحق (درهم)',
      amountMaxLabel: 'الحد الأقصى للمبلغ المستحق (درهم)',
      groupLabel: 'التصفية حسب المجموعة',
      groupAll: 'جميع المجموعات',
      statusLabel: 'التصفية حسب حالة الأداء',
      statusAll: 'جميع الحالات',
    },
    aging: {
      groupLabel: 'ملخص قِدَم المتأخرات',
      bucket: { '30': 'من 1 إلى 30 يومًا', '60': 'من 31 إلى 60 يومًا', ninetyPlus: '61 يومًا فأكثر' },
      total: 'المجموع المستحق',
    },
    table: { student: 'التلميذ', month: 'الشهر', aging: 'القِدَم', amount: 'المبلغ المستحق', status: 'الحالة', actions: 'إجراءات' },
    parentCard: { totalOutstanding: 'المجموع المستحق', unlinkedParent: 'لا يوجد ولي أمر مسجَّل' },
    empty: { title: 'لا توجد متأخرات', body: 'خبر سار: جميع الدفعات محدَّثة.' },
    noResults: { title: 'لا توجد نتائج', body: 'لا توجد متأخرات مطابقة لهذه التصفية.' },
    loadError: { title: 'تعذّر التحميل', body: 'فشل تحميل قائمة المتأخرات.', retry: 'إعادة المحاولة' },
    print: { title: 'قائمة المتأخرات — للمتابعة الهاتفية' },
    status: { unpaid: 'غير مدفوعة', partiallyPaid: 'مدفوعة جزئيًا', paid: 'مدفوعة' },
    payment: { dialogTitle: 'تسجيل دفعة', amount: 'المبلغ (درهم)', submit: 'حفظ', success: 'تم تسجيل الدفعة.' },
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-arrears-'));
}

export type Launched = { app: ElectronApplication; win: Page };

export async function launch(locale: Locale, plan: PlanId, userDataDir: string): Promise<Launched> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    env: { ...process.env, CS_LOCALE: locale, CS_PLAN: plan },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

/** Launch, clear the first-run + auth gates through the public bridge (same recipe every other suite uses). */
export async function boot(locale: Locale, plan: PlanId = 'premium'): Promise<Launched> {
  const live = await launch(locale, plan, freshUserDataDir());
  await live.win.evaluate(async (admin) => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  await live.win.reload();
  await live.win.waitForLoadState('domcontentloaded');
  return live;
}

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}

export async function gotoArrears(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navArrears, exact: true }).click();
  await win.waitForTimeout(400);
}

export async function gotoInvoices(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navInvoicing, exact: true }).click();
  await win.waitForTimeout(400);
}

type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

/** Escapes regex metacharacters so free text can be used as a literal substring match in locator name matchers. */
export function escapeRegExp(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
}

// ---------------------------------------------------------------------------
// Calendar helpers — no fake-clock hook exists (`SystemClock` is real wall-
// time and there is no CS_NOW/CS_CLOCK override), so every "overdue" fixture
// is computed relative to the real `new Date()` at test run time, never a
// hardcoded month.
// ---------------------------------------------------------------------------

/** `YYYY-MM` for `n` calendar months before `base` (n=0 → base's own month). */
export function monthsAgo(base: Date, n: number): string {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export type SeedGroupRef = { subjectId: string; roomId: string; groupId: string; level: string };

/** Seed one subject + one room + one active regular group, for the arrears "group" filter. */
export async function seedGroup(
  win: Page,
  opts: { subjectFr: string; subjectAr: string; roomName: string; level: string },
): Promise<SeedGroupRef> {
  return win.evaluate(async (o) => {
    const api = (window as unknown as { api: Bridge }).api;
    const subject = (await api.invoke('subject.create', { name: { fr: o.subjectFr, ar: o.subjectAr } })) as {
      id: string;
    };
    const room = (await api.invoke('room.create', { name: o.roomName, capacity: 10 })) as { id: string };
    const group = (await api.invoke('group.create', {
      subjectId: subject.id,
      teacherId: null,
      level: o.level,
      capacity: 10,
      kind: 'regular',
    })) as { id: string };
    return { subjectId: subject.id, roomId: room.id, groupId: group.id, level: o.level };
  }, opts);
}

export type SeedOverdueOpts = {
  /** `null` seeds no guardian at all; `{ id }` reuses an already-created parent (two children of the same parent must not hit `DuplicateParentError` from a second `parent.create` with the same name+phone); `{ name, phone }` creates a fresh one. */
  parent: { name: string; phone: string } | { id: string } | null;
  studentNameFr: string;
  studentNameAr: string;
  month: string;
  priceMad: number;
  groupId?: string;
  /** Reuse an existing subject (e.g. the one backing a seeded group) instead of creating a fresh one — required when `groupId` is set, since enrollment needs a subscription covering the group's own subject. */
  subjectId?: string;
  /** Amount already paid against the invoice (centimes-safe MAD), producing `partially-paid` instead of `unpaid`. */
  partialPaymentMad?: number;
};

/** Create a standalone parent through the bridge, for tests that need the same guardian across two seeded children. */
export async function seedParent(win: Page, opts: { name: string; phone: string }): Promise<{ id: string }> {
  return win.evaluate(async (o) => {
    const api = (window as unknown as { api: Bridge }).api;
    return api.invoke('parent.create', { name: o.name, phone: o.phone, relation: 'pere' }) as Promise<{ id: string }>;
  }, opts);
}

export type SeededOverdueInvoice = {
  parentId: string | null;
  studentId: string;
  studentNameFr: string;
  studentNameAr: string;
  subjectId: string;
  formulaId: string;
  invoiceId: string;
  priceMad: number;
};

/**
 * Seed one subject + one real Formula + one student (optionally linked to a
 * fresh parent, optionally enrolled in an existing group) + one active
 * `regular` StudentSubscription starting in `month`, run the monthly
 * generation job for `month`, move the drafted invoice to `issued` (the
 * Impayés channel only ever surfaces issued invoices), and optionally record a
 * partial payment. Returns everything a spec needs to assert on.
 */
export async function seedOverdueInvoice(win: Page, opts: SeedOverdueOpts): Promise<SeededOverdueInvoice> {
  return win.evaluate(async (o) => {
    const api = (window as unknown as { api: Bridge }).api;

    let parentId: string | null = null;
    if (o.parent !== null) {
      if ('id' in o.parent) {
        parentId = o.parent.id;
      } else {
        const parent = (await api.invoke('parent.create', {
          name: o.parent.name,
          phone: o.parent.phone,
          relation: 'pere',
        })) as { id: string };
        parentId = parent.id;
      }
    }

    const subjectId =
      o.subjectId ??
      ((await api.invoke('subject.create', {
        name: { fr: `Matière ${o.studentNameFr}`, ar: `مادة ${o.studentNameAr}` },
      })) as { id: string }).id;
    const formula = (await api.invoke('formula.create', {
      name: { fr: `Formule ${o.studentNameFr}`, ar: `صيغة ${o.studentNameAr}` },
      subjectIds: [subjectId],
      priceMad: Math.round(o.priceMad * 100),
      kind: 'regular',
    })) as { id: string };
    const student = (await api.invoke('student.create', {
      name: { fr: o.studentNameFr, ar: o.studentNameAr },
      birthDate: '2010-05-14',
      level: '3AC',
      school: null,
      notes: null,
      guardianIds: parentId !== null ? [parentId] : [],
    })) as { id: string };
    await api.invoke('subscription.create', {
      studentId: student.id,
      formulaId: formula.id,
      kind: 'regular',
      subjectIds: [subjectId],
      startMonth: o.month,
      endMonth: null,
    });
    if (o.groupId !== undefined) {
      await api.invoke('enrollment.create', {
        studentId: student.id,
        groupId: o.groupId,
        startMonth: o.month,
        endMonth: null,
      });
    }
    await api.invoke('invoice.generateMonthly', { month: o.month });
    const list = (await api.invoke('invoice.list', { studentId: student.id })) as { invoices: { id: string }[] };
    const invoice = list.invoices[0];
    if (!invoice) throw new Error('seedOverdueInvoice: no invoice was drafted by invoice.generateMonthly');
    await api.invoke('invoice.issue', { invoiceId: invoice.id });
    if (o.partialPaymentMad !== undefined) {
      await api.invoke('payment.record', {
        invoiceId: invoice.id,
        amountMad: Math.round(o.partialPaymentMad * 100),
        method: 'cash',
        paidOn: `${o.month}-05`,
      });
    }

    return {
      parentId,
      studentId: student.id,
      studentNameFr: o.studentNameFr,
      studentNameAr: o.studentNameAr,
      subjectId,
      formulaId: formula.id,
      invoiceId: invoice.id,
      priceMad: o.priceMad,
    };
  }, opts);
}

export type OverdueEntryDto = {
  invoiceId: string;
  studentId: string;
  month: string;
  outstandingMad: number;
  daysOverdue: number;
  monthsOverdue: number;
  agingBucket: '0-30' | '31-60' | '61-90' | '90-plus';
  status: 'unpaid' | 'partially-paid';
};

export type OverdueGroupDto = {
  parentId: string | null;
  parentName: string | null;
  parentPhone: string | null;
  totalOutstandingMad: number;
  invoices: OverdueEntryDto[];
};

/** Calls `invoice.overdue` directly through the bridge — used to calibrate real aging-bucket boundaries against real wall-clock time (no UI involved). */
export async function fetchOverdueDirect(
  win: Page,
  filters: { month?: string; minOutstandingMad?: number; maxOutstandingMad?: number; groupId?: string; status?: string } = {},
): Promise<{ groups: OverdueGroupDto[]; agingSummary: { bucket: string; count: number; outstandingMad: number }[] }> {
  return win.evaluate(async (filters) => {
    const api = (window as unknown as { api: Bridge }).api;
    return api.invoke('invoice.overdue', filters) as Promise<{
      groups: OverdueGroupDto[];
      agingSummary: { bucket: string; count: number; outstandingMad: number }[];
    }>;
  }, filters);
}

/** Record a payment against an invoice directly through the bridge (SOU-93's `payment.record`), bypassing the UI. */
export async function recordPaymentDirect(win: Page, invoiceId: string, amountMad: number, paidOn: string): Promise<unknown> {
  return win.evaluate(
    async ({ invoiceId, amountMad, paidOn }) => {
      const api = (window as unknown as { api: Bridge }).api;
      return api.invoke('payment.record', { invoiceId, amountMad: Math.round(amountMad * 100), method: 'cash', paidOn });
    },
    { invoiceId, amountMad, paidOn },
  );
}
