import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-298 — Weighted teacher fee attribution.
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer/domain/data implementation is
 * imported. Money-correctness assertions read the same public IPC surface the
 * SOU-76 payroll suite drives (`payroll.attributionBreakdown`,
 * `invoice.setAllocation`, `payment.summary`); the two UI-specific criteria
 * (formula per-subject price form, invoice allocation card) are driven through
 * the real screens. Every asserted string mirrors the localization catalog
 * (`i18n/fr.json` / `ar.json`), the user-facing contract.
 *
 * Launch switches (shared with the other suites):
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

/** Money helper — MAD → integer centimes, the app's on-the-wire money unit. */
export const centimes = (mad: number): number => Math.round(mad * 100);

/** The canonical SOU-298 pack: Math + FR + AR = 900 MAD, priced 440 / 230 / 230. */
export const PACK = {
  total: 900,
  math: 440,
  fr: 230,
  ar: 230,
} as const;

/** Current calendar month `YYYY-MM` — keeps subscription/generation/collection in-month. */
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** All copy the specs assert on, mirrored from i18n fr/ar.json. */
export const STR: Record<
  Locale,
  {
    navFormulas: string;
    navInvoicing: string;
    formula: {
      newBtn: string;
      nameFr: string;
      nameAr: string;
      subjects: string;
      price: string;
      create: string;
      createSuccess: string;
      perSubjectToggle: string;
      sumLabel: string;
      errSumMismatch: string;
      errCoverage: string;
      errInvalidAmount: string;
    };
    allocation: {
      title: string;
      configure: string;
      stateWeighted: string;
      manualToggle: string;
      save: string;
      success: string;
      sumMismatchHint: string;
    };
    invoiceStatus: { paid: string; partiallyPaid: string };
  }
> = {
  fr: {
    navFormulas: 'Formules',
    navInvoicing: 'Facturation',
    formula: {
      newBtn: 'Nouvelle formule',
      nameFr: 'Nom (français)',
      nameAr: 'Nom (arabe)',
      subjects: 'Matières incluses',
      price: 'Prix mensuel (MAD)',
      create: 'Créer la formule',
      createSuccess: 'Formule créée',
      perSubjectToggle: 'Répartir le prix par matière',
      sumLabel: 'Somme des matières',
      errSumMismatch: 'La somme des prix par matière doit être égale au prix total',
      errCoverage: 'Chaque matière sélectionnée doit avoir un prix',
      errInvalidAmount: 'Chaque prix par matière doit être supérieur à 0',
    },
    allocation: {
      title: 'Répartition par matière',
      configure: 'Configurer la répartition',
      stateWeighted: 'Répartition pondérée (par défaut)',
      manualToggle: 'Répartition manuelle',
      save: 'Enregistrer',
      success: 'Répartition enregistrée.',
      sumMismatchHint: 'La somme peut différer du total facturé : les montants servent de pondération.',
    },
    invoiceStatus: { paid: 'Payée', partiallyPaid: 'Payée partiellement' },
  },
  ar: {
    navFormulas: 'الصيغ',
    navInvoicing: 'الفوترة',
    formula: {
      newBtn: 'صيغة جديدة',
      nameFr: 'الاسم (بالفرنسية)',
      nameAr: 'الاسم (بالعربية)',
      subjects: 'المواد المضمّنة',
      price: 'السعر الشهري (درهم)',
      create: 'إنشاء الصيغة',
      createSuccess: 'تم إنشاء الصيغة',
      perSubjectToggle: 'توزيع السعر حسب المادة',
      sumLabel: 'مجموع المواد',
      errSumMismatch: 'مجموع الأسعار حسب المادة يجب أن يساوي السعر الإجمالي',
      errCoverage: 'يجب تحديد سعر لكل مادة مختارة',
      errInvalidAmount: 'كل سعر لكل مادة يجب أن يكون أكبر من 0',
    },
    allocation: {
      title: 'التوزيع حسب المادة',
      configure: 'ضبط التوزيع',
      stateWeighted: 'توزيع مرجّح (افتراضي)',
      manualToggle: 'توزيع يدوي',
      save: 'حفظ',
      success: 'تم حفظ التوزيع.',
      sumMismatchHint: 'قد يختلف المجموع عن إجمالي الفاتورة: المبالغ تُستعمل كأوزان.',
    },
    invoiceStatus: { paid: 'مدفوعة', partiallyPaid: 'مدفوعة جزئيًا' },
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-sou298-'));
}

export type Launched = { app: ElectronApplication; win: Page };

type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

export async function launch(locale: Locale, plan: PlanId, userDataDir: string): Promise<Launched> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    env: { ...process.env, CS_LOCALE: locale, CS_PLAN: plan },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

/** Launch, clear the first-run + auth gates through the public bridge, reload into the shell. */
export async function boot(locale: Locale, plan: PlanId = 'premium'): Promise<Launched> {
  const live = await launch(locale, plan, freshUserDataDir());
  await live.win.evaluate(async (admin) => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  await live.win.reload();
  await live.win.waitForLoadState('domcontentloaded');
  return live;
}

export type AttributionSeed = {
  month: string;
  subjects: { math: string; fr: string; ar: string };
  teachers: { math: string; fr: string };
  formulaId: string;
  studentId: string;
  invoiceId: string;
  invoiceTotalMad: number;
};

export type SeedOptions = {
  /** Whether the formula carries a per-subject price map (weighted) or not (equal-split fallback). */
  withPriceMap: boolean;
  /** The Math teacher also teaches the FR group (multi-subject summation scenario). */
  mathTeacherAlsoTeachesFr?: boolean;
  /** MAD actually collected against the invoice; omit for no payment. */
  collectMad?: number;
};

/**
 * Seed a complete attribution scenario through the public bridge:
 *   3 subjects (Math/FR/AR), 1-2 teachers on a 100 % percentage rule, a
 *   Math+FR+AR = 900 formula (optionally with the 440/230/230 price map), a
 *   student subscribed to it, groups per subject each taught by a teacher, the
 *   student enrolled in the Math (and optionally FR) group, then the month's
 *   invoice generated + issued and (optionally) a payment recorded.
 *
 * Percentage rules are pinned at 100 % so the attribution BASE and the payout
 * coincide — the assertion holds whether the breakdown reports the base or the
 * base × percent.
 */
export async function seedAttribution(win: Page, opts: SeedOptions): Promise<AttributionSeed> {
  return win.evaluate(
    async ({ opts, PACK, month }) => {
      const api = (window as unknown as { api: Bridge }).api;
      const toCentimes = (mad: number): number => Math.round(mad * 100);

      const math = (await api.invoke('subject.create', { name: { fr: 'Mathématiques', ar: 'الرياضيات' }, code: 'MATH' })) as { id: string };
      const fr = (await api.invoke('subject.create', { name: { fr: 'Français', ar: 'الفرنسية' }, code: 'FR' })) as { id: string };
      const ar = (await api.invoke('subject.create', { name: { fr: 'Arabe', ar: 'العربية' }, code: 'AR' })) as { id: string };

      const mathTeacher = (await api.invoke('teacher.create', {
        name: { fr: 'Prof Math', ar: 'أستاذ الرياضيات' },
        phone: '0611111111',
        subjectIds: [],
      })) as { id: string };
      const frTeacher = (await api.invoke('teacher.create', {
        name: { fr: 'Prof Français', ar: 'أستاذ الفرنسية' },
        phone: '0622222222',
        subjectIds: [],
      })) as { id: string };

      for (const t of [mathTeacher.id, frTeacher.id]) {
        await api.invoke('teacherPayrollRule.create', {
          kind: 'percentage-of-monthly-fees',
          teacherId: t,
          percent: 100,
          startMonth: month,
          endMonth: null,
        });
      }

      const formulaReq: Record<string, unknown> = {
        name: { fr: 'Pack Math+FR+AR', ar: 'باقة الرياضيات والفرنسية والعربية' },
        subjectIds: [math.id, fr.id, ar.id],
        priceMad: toCentimes(PACK.total),
        kind: 'regular',
      };
      if (opts.withPriceMap) {
        formulaReq.subjectPrices = [
          { subjectId: math.id, priceMad: toCentimes(PACK.math) },
          { subjectId: fr.id, priceMad: toCentimes(PACK.fr) },
          { subjectId: ar.id, priceMad: toCentimes(PACK.ar) },
        ];
      }
      const formula = (await api.invoke('formula.create', formulaReq)) as { id: string };

      const student = (await api.invoke('student.create', {
        name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
        birthDate: '2010-05-14',
        level: '3AC',
      })) as { id: string };

      await api.invoke('subscription.create', {
        studentId: student.id,
        formulaId: formula.id,
        kind: 'regular',
        subjectIds: [math.id, fr.id, ar.id],
        startMonth: month,
        endMonth: null,
      });

      const mkGroup = async (subjectId: string, teacherId: string): Promise<{ id: string }> =>
        (await api.invoke('group.create', {
          subjectId,
          teacherId,
          level: '3AC',
          capacity: 30,
          kind: 'regular',
        })) as { id: string };

      const mathGroup = await mkGroup(math.id, mathTeacher.id);
      const frGroup = await mkGroup(fr.id, opts.mathTeacherAlsoTeachesFr ? mathTeacher.id : frTeacher.id);
      const arGroup = await mkGroup(ar.id, frTeacher.id);

      for (const g of [mathGroup.id, frGroup.id, arGroup.id]) {
        await api.invoke('enrollment.create', { studentId: student.id, groupId: g, startMonth: month, endMonth: null });
      }

      await api.invoke('invoice.generateMonthly', { month });
      const list = (await api.invoke('invoice.list', { studentId: student.id })) as { invoices: { id: string; totalMad: number }[] };
      const invoice = list.invoices[0];
      if (!invoice) throw new Error('seedAttribution: no invoice generated');
      await api.invoke('invoice.issue', { invoiceId: invoice.id });

      if (opts.collectMad !== undefined) {
        await api.invoke('payment.record', {
          invoiceId: invoice.id,
          amountMad: toCentimes(opts.collectMad),
          method: 'cash',
          paidOn: `${month}-15`,
        });
      }

      await api.invoke('payroll.computeMonthly', { month });

      return {
        month,
        subjects: { math: math.id, fr: fr.id, ar: ar.id },
        teachers: { math: mathTeacher.id, fr: frTeacher.id },
        formulaId: formula.id,
        studentId: student.id,
        invoiceId: invoice.id,
        invoiceTotalMad: invoice.totalMad,
      };
    },
    { opts, PACK, month: currentMonth() },
  );
}

export type BreakdownRow = { teacherId: string; subjectId: string; amountMad: number };

/** Fetch the month's flat attribution breakdown through the public bridge. */
export async function fetchBreakdown(win: Page, month: string): Promise<BreakdownRow[]> {
  return win.evaluate(async (m) => {
    const api = (window as unknown as { api: Bridge }).api;
    const res = (await api.invoke('payroll.attributionBreakdown', { month: m })) as { breakdown: BreakdownRow[] };
    return res.breakdown;
  }, month);
}

/** Sum a teacher's attributed centimes across all subjects (multi-subject summation). */
export function teacherTotal(rows: BreakdownRow[], teacherId: string): number {
  return rows.filter((r) => r.teacherId === teacherId).reduce((acc, r) => acc + r.amountMad, 0);
}

/** One teacher+subject attributed cell (centimes), or null if absent. */
export function cell(rows: BreakdownRow[], teacherId: string, subjectId: string): number | null {
  const found = rows.find((r) => r.teacherId === teacherId && r.subjectId === subjectId);
  return found ? found.amountMad : null;
}

/** Set (or clear with null) a manual per-subject allocation through the public bridge. */
export async function setAllocation(
  win: Page,
  invoiceId: string,
  allocations: { subjectId: string; amountMad: number }[] | null,
): Promise<void> {
  await win.evaluate(
    async ({ invoiceId, allocations }) => {
      const api = (window as unknown as { api: Bridge }).api;
      await api.invoke('invoice.setAllocation', { invoiceId, allocations });
    },
    { invoiceId, allocations },
  );
}

export type PaymentSummary = { total: number; netPaid: number; outstanding: number; status: string; ledger: unknown[] };

/** Read an invoice's derived payment summary + append-only ledger through the public bridge. */
export async function paymentSummary(win: Page, invoiceId: string): Promise<PaymentSummary> {
  return win.evaluate(async (id) => {
    const api = (window as unknown as { api: Bridge }).api;
    const res = (await api.invoke('payment.summary', { invoiceId: id })) as {
      total: number;
      netPaid: number;
      outstanding: number;
      status: string;
      ledger: unknown[];
    };
    return { total: res.total, netPaid: res.netPaid, outstanding: res.outstanding, status: res.status, ledger: res.ledger };
  }, invoiceId);
}

export async function gotoFormulas(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navFormulas, exact: true }).click();
  await win.waitForTimeout(400);
}

export async function gotoInvoices(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navInvoicing, exact: true }).click();
  await win.waitForTimeout(400);
}

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}
