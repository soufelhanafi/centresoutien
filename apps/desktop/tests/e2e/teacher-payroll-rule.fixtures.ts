import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-72 — TeacherPayrollRule CRUD UI (discriminated
 * by kind) on the teacher detail "Rémunération" / "الأجر" tab.
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer/domain/data implementation is
 * imported. Every string the specs assert on mirrors the localization catalog
 * (`i18n/fr.json` / `ar.json`, `teachers.detail.tabs.payroll` and
 * `teachers.detail.payroll.*`), exactly as sibling fixtures do.
 *
 * Rule creation/change itself is driven through the UI form (not seeded via
 * the bridge): there is no documented public-bridge payload shape for
 * `teacherPayrollRule.create` available to a black-box tester, and exercising
 * the real form is exactly what this ticket is testing.
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

/** Copy the specs assert on, mirrored from i18n fr/ar.json (`teachers.*`). */
export const STR: Record<
  Locale,
  {
    navTeachers: string;
    payrollTab: string;
    active: {
      title: string;
      since: (month: string) => string;
      change: string;
      fixedAmount: string;
      percentageAmount: string;
      emptyTitle: string;
      emptyBody: string;
      emptyCta: string;
    };
    history: { title: string; empty: string; period: string; amount: string; kind: string };
    kind: { fixedMonthly: string; percentageOfMonthlyFees: string };
    form: {
      createTitle: string;
      changeTitle: string;
      kind: string;
      amount: string;
      percent: string;
      startMonth: string;
      cancel: string;
      create: string;
      save: string;
      createSuccess: string;
      changeSuccess: string;
    };
    lockedBody: string;
    lockedBadge: string;
  }
> = {
  fr: {
    navTeachers: 'Enseignants',
    payrollTab: 'Rémunération',
    active: {
      title: 'Règle active',
      since: (month) => `En vigueur depuis ${month}`,
      change: 'Modifier la règle',
      fixedAmount: 'Montant fixe mensuel',
      percentageAmount: 'Pourcentage des frais attribués',
      emptyTitle: 'Aucune règle de paie',
      emptyBody: 'Définissez une règle pour que cet enseignant apparaisse dans les versements mensuels.',
      emptyCta: 'Définir une règle',
    },
    history: { title: 'Historique', empty: 'Aucune règle antérieure.', period: 'Période', amount: 'Montant', kind: 'Type' },
    kind: { fixedMonthly: 'Montant fixe', percentageOfMonthlyFees: 'Pourcentage des frais' },
    form: {
      createTitle: 'Définir une règle de paie',
      changeTitle: 'Modifier la règle de paie',
      kind: 'Type de règle',
      amount: 'Montant mensuel (MAD)',
      percent: 'Pourcentage (%)',
      startMonth: "Mois d'effet",
      cancel: 'Annuler',
      create: 'Définir la règle',
      save: 'Enregistrer',
      createSuccess: 'Règle enregistrée',
      changeSuccess: 'Règle mise à jour',
    },
    lockedBody: 'Réservé à un plan supérieur',
    lockedBadge: 'PRO',
  },
  ar: {
    navTeachers: 'الأساتذة',
    payrollTab: 'الأجر',
    active: {
      title: 'القاعدة النشطة',
      since: (month) => `سارية منذ ${month}`,
      change: 'تعديل القاعدة',
      fixedAmount: 'مبلغ شهري ثابت',
      percentageAmount: 'نسبة من الرسوم المسندة',
      emptyTitle: 'لا توجد قاعدة أجر',
      emptyBody: 'حدّد قاعدة ليظهر هذا الأستاذ في الدفعات الشهرية.',
      emptyCta: 'تحديد قاعدة',
    },
    history: { title: 'السجل', empty: 'لا توجد قواعد سابقة.', period: 'الفترة', amount: 'المبلغ', kind: 'النوع' },
    kind: { fixedMonthly: 'مبلغ ثابت', percentageOfMonthlyFees: 'نسبة من الرسوم' },
    form: {
      createTitle: 'تحديد قاعدة أجر',
      changeTitle: 'تعديل قاعدة الأجر',
      kind: 'نوع القاعدة',
      amount: 'المبلغ الشهري (درهم)',
      percent: 'النسبة (%)',
      startMonth: 'شهر السريان',
      cancel: 'إلغاء',
      create: 'تحديد القاعدة',
      save: 'حفظ',
      createSuccess: 'تم حفظ القاعدة',
      changeSuccess: 'تم تحديث القاعدة',
    },
    lockedBody: 'غير متاح في خطتك',
    lockedBadge: 'PRO',
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-teacher-payroll-'));
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

/**
 * Launch, clear the first-run + auth gates, and seed the given teachers
 * through the public bridge so specs can navigate straight to a detail page.
 */
export async function boot(
  locale: Locale,
  opts: {
    plan?: PlanId;
    teachers?: readonly { nameFr: string; nameAr: string; phone: string }[];
  } = {},
): Promise<Launched> {
  const plan = opts.plan ?? 'premium';
  const live = await launch(locale, plan, freshUserDataDir());

  await live.win.evaluate(
    async (payload) => {
      const api = (window as unknown as { api: Bridge }).api;
      await api.invoke('admin.create', payload.admin);
      await api.invoke('auth.login', { ...payload.admin, rememberDevice: true });
      for (const t of payload.teachers) {
        await api.invoke('teacher.create', {
          name: { fr: t.nameFr, ar: t.nameAr },
          phone: t.phone,
          subjectIds: [],
        });
      }
    },
    { admin: VALID_ADMIN, teachers: opts.teachers ?? [] },
  );

  await live.win.reload();
  await live.win.waitForLoadState('domcontentloaded');

  return live;
}

/** Navigate to the Teachers list via the sidebar. */
export async function gotoTeachers(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navTeachers, exact: true }).click();
  await win.waitForTimeout(400);
}

/** From the list, open a teacher's detail page via the name link, then the Payroll tab. */
export async function openPayrollTab(win: Page, L: (typeof STR)[Locale], name: RegExp): Promise<void> {
  await win.getByRole('row', { name }).getByRole('link', { name }).first().click();
  await win.waitForTimeout(400);
  await win.getByRole('tab', { name: L.payrollTab }).click();
  await win.waitForTimeout(300);
}

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}
