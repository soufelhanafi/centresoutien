import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-100 — Dashboard Basique + Avancé (KPIs and widgets).
 *
 * Driven exclusively through the running packaged app, the public preload
 * bridge (`window.api.invoke`), and the DOM. No renderer/domain/data
 * implementation is imported. Every string the specs assert on mirrors
 * `i18n/fr.json` / `ar.json`'s `dashboard` (+ `plan.locked` / `plan.viewPlans`)
 * namespaces — the user-facing localization contract, exactly as the other
 * suites do.
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

export const STR: Record<
  Locale,
  {
    navDashboard: string;
    title: string;
    tabs: { basic: string; advanced: string };
    kpis: { todaysSessions: string; activeStudents: string; unpaidInvoices: string };
    quickActions: { title: string; addStudent: string; recordPayment: string; addSession: string };
    widgets: { revenueTrend: string; enrollmentEvolution: string; attendanceRate: string; subjectBreakdown: string };
    subjectBreakdownEmpty: string;
    /** The short "reserved for a higher plan" copy shown on every lock affordance app-wide (`plan.locked`). */
    lockedShort: string;
    /** The dashboard-specific teaser sentence behind the blur (`dashboard.advanced.lockedBody`). */
    lockedTeaser: string;
    viewPlans: string;
  }
> = {
  fr: {
    navDashboard: 'Tableau de bord',
    title: 'Tableau de bord',
    tabs: { basic: 'Basique', advanced: 'Avancé' },
    kpis: {
      todaysSessions: "Séances aujourd'hui",
      activeStudents: 'Élèves actifs',
      unpaidInvoices: 'Factures impayées',
    },
    quickActions: {
      title: 'Actions rapides',
      addStudent: 'Ajouter un élève',
      recordPayment: 'Enregistrer un paiement',
      addSession: 'Ajouter une séance',
    },
    widgets: {
      revenueTrend: "Évolution du chiffre d'affaires",
      enrollmentEvolution: 'Évolution des inscriptions',
      attendanceRate: 'Taux de présence — ce mois-ci',
      subjectBreakdown: 'Répartition par matière',
    },
    subjectBreakdownEmpty: 'Aucun encaissement ce mois-ci.',
    lockedShort: 'Réservé à un plan supérieur',
    lockedTeaser: "Évolution du chiffre d'affaires, des inscriptions, taux de présence et répartition par matière.",
    viewPlans: 'Voir les plans',
  },
  ar: {
    navDashboard: 'لوحة القيادة',
    title: 'لوحة القيادة',
    tabs: { basic: 'أساسي', advanced: 'متقدم' },
    kpis: {
      todaysSessions: 'الحصص اليوم',
      activeStudents: 'التلاميذ النشيطون',
      unpaidInvoices: 'الفواتير غير المؤداة',
    },
    quickActions: {
      title: 'إجراءات سريعة',
      addStudent: 'إضافة تلميذ',
      recordPayment: 'تسجيل دفعة',
      addSession: 'إضافة حصة',
    },
    widgets: {
      revenueTrend: 'تطور رقم المعاملات',
      enrollmentEvolution: 'تطور التسجيلات',
      attendanceRate: 'نسبة الحضور — هذا الشهر',
      subjectBreakdown: 'التوزيع حسب المادة',
    },
    subjectBreakdownEmpty: 'لا توجد مداخيل محصلة هذا الشهر.',
    lockedShort: 'غير متاح في خطتك',
    lockedTeaser: 'تطور رقم المعاملات والتسجيلات، نسبة الحضور والتوزيع حسب المادة.',
    viewPlans: 'عرض الخطط',
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-dashboard-'));
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

export async function gotoDashboard(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navDashboard, exact: true }).click();
  await win.waitForTimeout(300);
}

type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

function todayParts(): { month: string; date: string; dayOfWeek: number } {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return { month: `${yyyy}-${mm}`, date: `${yyyy}-${mm}-${dd}`, dayOfWeek: now.getDay() };
}

export type SeededDashboardData = {
  studentId: string;
  invoiceId: string;
  sessionId: string | null;
  groupId: string;
  month: string;
};

/**
 * Seeds a full month of real activity through the public bridge: one subject +
 * formula + student + active regular subscription, one drafted-then-generated
 * invoice for the current month, one FULL payment against it (paid, 300 MAD),
 * one room + regular group the student is enrolled into, one weekly recurring
 * session today (within the 09:00–18:00 default center hours) materialized to a
 * concrete session, and one 'present' attendance record against it.
 *
 * Exercises every Basique KPI (today's sessions, active students, unpaid
 * invoices) and every Avancé widget (revenue trend, enrollment evolution,
 * attendance rate, per-subject revenue breakdown) with non-zero data.
 */
export async function seedFullMonth(win: Page): Promise<SeededDashboardData> {
  const { month, date, dayOfWeek } = todayParts();
  return win.evaluate(
    async ({ month, date, dayOfWeek }) => {
      const api = (window as unknown as { api: Bridge }).api;
      const subject = (await api.invoke('subject.create', { name: { fr: 'Maths', ar: 'رياضيات' }, code: 'MATH' })) as {
        id: string;
      };
      const formula = (await api.invoke('formula.create', {
        name: { fr: 'Maths seul', ar: 'الرياضيات فقط' },
        subjectIds: [subject.id],
        priceMad: 30000,
        kind: 'regular',
      })) as { id: string };
      const student = (await api.invoke('student.create', {
        name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
        birthDate: '2010-05-14',
        level: '3AC',
        school: null,
        notes: null,
        guardianIds: [],
      })) as { id: string };
      await api.invoke('subscription.create', {
        studentId: student.id,
        formulaId: formula.id,
        kind: 'regular',
        subjectIds: [subject.id],
        startMonth: month,
        endMonth: null,
      });
      await api.invoke('invoice.generateMonthly', { month });
      const list = (await api.invoke('invoice.list', { studentId: student.id })) as { invoices: { id: string }[] };
      const invoice = list.invoices[0];
      if (!invoice) throw new Error('seedFullMonth: no invoice was drafted by invoice.generateMonthly');
      await api.invoke('payment.record', { invoiceId: invoice.id, amountMad: 30000, method: 'cash', paidOn: date });

      const room = (await api.invoke('room.create', { name: 'Salle QA', capacity: 20 })) as { id: string };
      const group = (await api.invoke('group.create', {
        subjectId: subject.id,
        teacherId: null,
        roomId: room.id,
        level: '3AC',
        capacity: 15,
        kind: 'regular',
      })) as { id: string };
      await api.invoke('enrollment.create', { studentId: student.id, groupId: group.id, startMonth: month, endMonth: null });

      const wrs = (await api.invoke('weeklySession.create', {
        roomId: room.id,
        teacherId: null,
        groupId: group.id,
        dayOfWeek,
        start: '10:00',
        end: '11:00',
      })) as { id: string };
      const gen = (await api.invoke('session.generate', { recurringSessionId: wrs.id, from: date, to: date })) as {
        sessions: { id: string }[];
      };
      const sessionId = gen.sessions[0]?.id ?? null;
      if (sessionId) {
        await api.invoke('attendance.record', { sessionId, records: [{ studentId: student.id, status: 'present' }] });
      }

      return { studentId: student.id, invoiceId: invoice.id, sessionId, groupId: group.id, month };
    },
    { month, date, dayOfWeek },
  );
}

/** Read the raw dashboard.basic / dashboard.advanced payloads directly through the bridge (bypasses the UI). */
export async function readDashboardApi(win: Page): Promise<{ basic: unknown; advanced: unknown }> {
  return win.evaluate(async () => {
    const api = (window as unknown as { api: Bridge }).api;
    const basic = await api.invoke('dashboard.basic', {});
    let advanced: unknown = null;
    try {
      advanced = await api.invoke('dashboard.advanced', {});
    } catch (e) {
      advanced = { error: e instanceof Error ? e.message : String(e) };
    }
    return { basic, advanced };
  });
}

/** Bounding box helper: returns {left, right} in page coordinates for a locator's first match. */
export async function edges(win: Page, selectorText: string): Promise<{ left: number; right: number } | null> {
  const loc = win.getByText(selectorText, { exact: true }).first();
  const box = await loc.boundingBox();
  if (!box) return null;
  return { left: box.x, right: box.x + box.width };
}
