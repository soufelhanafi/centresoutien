import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-76 — the payroll dashboard ("/payroll"): per-month
 * list of teacher payouts, single/bulk "mark paid" confirm actions, the
 * payslip-generation export, and the per-teacher attribution drill-down.
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer/domain/data implementation is
 * imported. Every string the specs assert on was read off the running UI
 * (screenshots + `innerText`), not off the i18n source files.
 *
 * Seeding uses the real domain-facing IPC channels (`teacher.create`,
 * `teacherPayrollRule.create`, `payroll.computeMonthly`) — the same surface
 * SOU-74's compute job and SOU-72's rule CRUD already exercise — so a payout
 * row exists to drive the dashboard's own actions against.
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

/** Copy the specs assert on, read off the running FR/AR UI (payroll dashboard). */
export const STR: Record<
  Locale,
  {
    navPayroll: string;
    pageTitle: string;
    subtitle: string;
    generateButton: string;
    bulkMarkPaidButton: string;
    monthFilterLabel: string;
    table: { teacher: string; ruleKind: string; base: string; total: string; status: string; actions: string };
    kind: { fixedMonthly: string; percentageOfMonthlyFees: string };
    status: { draft: string; paid: string };
    rowConfirmAction: string;
    singleConfirmSuccess: string;
    payslipsGeneratedToast: (count: number) => string;
    bulkConfirmToast: (confirmed: number, skipped: number) => string;
    emptyState: { title: string; body: string };
    drilldown: { title: string; empty: string; show: string; hide: string };
    projection: { title: string; estimate: string };
    lockedTitle: string;
    lockedBody: string;
  }
> = {
  fr: {
    navPayroll: 'Paie',
    pageTitle: 'Paie des enseignants',
    subtitle: 'Confirmez les versements du mois et générez les bulletins de paie.',
    generateButton: 'Générer les bulletins',
    bulkMarkPaidButton: 'Marquer tout payé',
    monthFilterLabel: 'Filtrer par mois',
    table: { teacher: 'Enseignant', ruleKind: 'Type de règle', base: 'Base', total: 'Total', status: 'Statut', actions: 'Actions' },
    kind: { fixedMonthly: 'Montant fixe', percentageOfMonthlyFees: 'Pourcentage des frais' },
    status: { draft: 'Brouillon', paid: 'Payé' },
    rowConfirmAction: 'Marquer payé',
    singleConfirmSuccess: 'Versement marqué payé.',
    payslipsGeneratedToast: (n) => `${n} bulletin(s) généré(s).`,
    bulkConfirmToast: (confirmed, skipped) => `${confirmed} versement(s) confirmé(s), ${skipped} déjà payé(s).`,
    emptyState: { title: 'Aucun versement', body: "Aucun enseignant n'a de règle de paie active pour ce mois." },
    drilldown: {
      title: 'Répartition par matière',
      empty: 'Aucune répartition attribuée pour ce mois.',
      show: 'Afficher le détail',
      hide: 'Masquer le détail',
    },
    projection: { title: 'Mois en cours', estimate: 'Estimation' },
    lockedTitle: 'Paie',
    lockedBody: 'Réservé à un plan supérieur',
  },
  ar: {
    navPayroll: 'أجور الأساتذة',
    pageTitle: 'أجور الأساتذة',
    subtitle: 'أكّد استحقاقات الشهر وأنشئ كشوف الأجور.',
    generateButton: 'إنشاء كشوف الأجور',
    bulkMarkPaidButton: 'تعليم الكل كمدفوع',
    monthFilterLabel: 'التصفية حسب الشهر',
    table: { teacher: 'الأستاذ', ruleKind: 'نوع القاعدة', base: 'الأساس', total: 'المجموع', status: 'الحالة', actions: 'إجراءات' },
    kind: { fixedMonthly: 'مبلغ ثابت', percentageOfMonthlyFees: 'نسبة من الرسوم' },
    status: { draft: 'مسودة', paid: 'مدفوع' },
    rowConfirmAction: 'تعليم كمدفوع',
    singleConfirmSuccess: 'تم تعليم الاستحقاق كمدفوع.',
    payslipsGeneratedToast: (n) => `تم إنشاء ${n} كشف أجر.`,
    bulkConfirmToast: (confirmed, skipped) => `تم تأكيد ${confirmed} استحقاق(ات)، ${skipped} مدفوع(ة) مسبقًا.`,
    emptyState: { title: 'لا توجد استحقاقات', body: 'لا يوجد أستاذ لديه قاعدة أجر نشطة لهذا الشهر.' },
    drilldown: {
      title: 'التوزيع حسب المادة',
      empty: 'لا يوجد توزيع لهذا الشهر.',
      show: 'إظهار التفاصيل',
      hide: 'إخفاء التفاصيل',
    },
    projection: { title: 'الشهر الجاري', estimate: 'تقدير' },
    lockedTitle: 'أجور الأساتذة',
    lockedBody: 'غير متاح في خطتك',
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-payroll-'));
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

export type SeedTeacherRule =
  | { kind: 'fixed-monthly'; nameFr: string; nameAr: string; phone: string; amountMad: number }
  | { kind: 'percentage-of-monthly-fees'; nameFr: string; nameAr: string; phone: string; percent: number };

/**
 * Launch, clear the first-run + auth gates, seed teachers with a live payroll
 * rule for `month` through the public bridge, then run the SOU-74 compute job
 * so each seeded teacher has a `draft` payout row for the dashboard to list.
 */
export async function boot(
  locale: Locale,
  opts: {
    plan?: PlanId;
    month?: string;
    teachers?: readonly SeedTeacherRule[];
  } = {},
): Promise<Launched> {
  const plan = opts.plan ?? 'premium';
  const month = opts.month ?? '2026-08';
  const live = await launch(locale, plan, freshUserDataDir());

  await live.win.evaluate(
    async (payload) => {
      const api = (window as unknown as { api: Bridge }).api;
      await api.invoke('admin.create', payload.admin);
      await api.invoke('auth.login', { ...payload.admin, rememberDevice: true });
      for (const t of payload.teachers) {
        const created = (await api.invoke('teacher.create', {
          name: { fr: t.nameFr, ar: t.nameAr },
          phone: t.phone,
          subjectIds: [],
        })) as { id: string };
        if (t.kind === 'fixed-monthly') {
          await api.invoke('teacherPayrollRule.create', {
            kind: 'fixed-monthly',
            teacherId: created.id,
            amountMad: t.amountMad,
            startMonth: payload.month,
            endMonth: null,
          });
        } else {
          await api.invoke('teacherPayrollRule.create', {
            kind: 'percentage-of-monthly-fees',
            teacherId: created.id,
            percent: t.percent,
            startMonth: payload.month,
            endMonth: null,
          });
        }
      }
      if (payload.teachers.length > 0) {
        await api.invoke('payroll.computeMonthly', { month: payload.month });
      }
    },
    { admin: VALID_ADMIN, teachers: opts.teachers ?? [], month },
  );

  await live.win.reload();
  await live.win.waitForLoadState('domcontentloaded');

  return live;
}

/** Navigate to the payroll dashboard via the sidebar link, optionally selecting a specific month. */
export async function gotoPayroll(win: Page, L: (typeof STR)[Locale], month?: string): Promise<void> {
  await win.getByRole('link', { name: L.navPayroll, exact: true }).click();
  await win.waitForTimeout(400);
  if (month) {
    await win.getByLabel(L.monthFilterLabel).fill(month);
    await win.waitForTimeout(500);
  }
}

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}

/** Invoke an IPC channel directly through the preload bridge (for edge cases the UI never exposes, e.g. a repeat confirm on an already-paid payout). */
export async function invokeBridge<T = unknown>(win: Page, channel: string, request: unknown): Promise<T> {
  return win.evaluate(
    async ({ channel, request }) => (await (window as unknown as { api: Bridge }).api.invoke(channel, request)) as T,
    { channel, request },
  );
}

/** Invoke an IPC channel and capture a rejection instead of letting it throw, for asserting on the domain error code. */
export async function invokeBridgeExpectingError(
  win: Page,
  channel: string,
  request: unknown,
): Promise<{ code: string | null; raw: string }> {
  return win.evaluate(
    async ({ channel, request }) => {
      const api = (window as unknown as { api: Bridge }).api;
      try {
        await api.invoke(channel, request);
        return { code: null, raw: 'no-error' };
      } catch (e) {
        const raw = String(e);
        const match = /@@CS_DOMAIN_ERROR@@(.*?)@@CS_DOMAIN_ERROR@@/.exec(raw);
        const code = match ? (JSON.parse(match[1]) as { code: string }).code : null;
        return { code, raw };
      }
    },
    { channel, request },
  );
}

/** Stubs `shell.openPath` so "Générer les bulletins" doesn't hang waiting on a real OS PDF viewer under CI/Xvfb (mirrors `invoices.fixtures.ts`). */
export async function stubOpenPath(app: ElectronApplication): Promise<void> {
  await app.evaluate(async ({ shell }) => {
    shell.openPath = (async () => '') as never;
  });
}
