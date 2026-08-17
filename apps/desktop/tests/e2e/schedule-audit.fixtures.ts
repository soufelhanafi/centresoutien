import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-201 — "Audit du planning", driven through the
 * planner modal (SOU-240).
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer / domain / data implementation is
 * imported. Every asserted string was read off the LIVE running app in both
 * locales (never from source), exactly as the SOU-165 override and SOU-30
 * holiday suites mirror their user-facing contract.
 *
 * The audit modal lists persisted, dated `Session` occurrences that the center's
 * effective (override-aware) hours or a holiday now place outside a valid
 * window. Seeding recipe (all via the SAME public channels the app itself uses):
 *   1. reference data (room / teacher / subject / group),
 *   2. a weekly recurring template (`weeklySession.create` → `wrs_` id),
 *   3. materialize its dated occurrences (`session.generate` over a window),
 *   4. THEN strand one or more of them by narrowing the weekday with a
 *      center-hours override (`centerHoursOverride.save`) and/or dropping a
 *      holiday on the date (`holiday.create`).
 * The strand step runs AFTER generation so the occurrence is materialized first,
 * exactly matching the acceptance criteria ("added after a session was
 * generated").
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';

export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

/** Reference data seeded into every stranding scenario — names appear verbatim on the audit rows. */
export const REF = {
  room: 'Salle A',
  teacherFr: 'Ahmed Benali',
  teacherAr: 'أحمد بنعلي',
  subjectFr: 'Mathématiques',
  subjectAr: 'الرياضيات',
  groupLevel: '2 Bac SM',
} as const;

/**
 * The two materialized Mondays used across the suite are computed from the
 * runtime clock (SOU-255 rule) — the next two Mondays strictly after today, so
 * the audit, which only surfaces live (non-past) occurrences, always lists them.
 * Dates are built from LOCAL calendar components (never `toISOString`, which
 * would shift the day across the UTC boundary).
 */
function isoLocalDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function nextMondayStrictlyAfter(base: Date): Date {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const daysUntilMonday = (1 - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + daysUntilMonday);
  return date;
}

/**
 * The date label exactly as the running app renders it: day + long month + year,
 * space-separated. Moroccan Arabic (`ar-MA`) names August "غشت"; the app renders
 * Arabic dates with LATIN digits, so `numberingSystem: 'latn'` is forced to match
 * the live audit row (which `rowForDate` matches by `hasText`).
 */
function dateLabel(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-MA' : 'fr', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    numberingSystem: 'latn',
  }).format(date);
}

const firstMonday = nextMondayStrictlyAfter(new Date());
const secondMonday = new Date(firstMonday.getFullYear(), firstMonday.getMonth(), firstMonday.getDate() + 7);

/** The two materialized Mondays as `YYYY-MM-DD`, both strictly future vs the runtime clock. */
export const MONDAYS = { first: isoLocalDate(firstMonday), second: isoLocalDate(secondMonday) } as const;

/** `session.generate` materializes every Monday within [from,to] inclusive. */
export const SEED_FIRST_ONLY = { from: MONDAYS.first, to: MONDAYS.first } as const;
export const SEED_BOTH = { from: MONDAYS.first, to: MONDAYS.second } as const;

/** Localized labels for the two Mondays, matched verbatim against the live audit rows. */
export const DATE: Record<Locale, { first: string; second: string }> = {
  fr: { first: dateLabel(firstMonday, 'fr'), second: dateLabel(secondMonday, 'fr') },
  ar: { first: dateLabel(firstMonday, 'ar'), second: dateLabel(secondMonday, 'ar') },
};

/** All copy the specs assert on, mirrored from the LIVE running app in both locales. */
export const STR: Record<
  Locale,
  {
    navPlanning: string;
    planningTitle: string;
    auditTrigger: string;
    pageTitle: string;
    subtitle: string;
    reasonOutsideHours: string;
    reasonHoliday: string;
    cancelRowBtn: string;
    dialogTitle: string;
    dialogBody: string;
    dialogConfirm: string;
    dialogBack: string;
    emptyTitle: string;
    emptySubtitle: string;
    groupRepeats: (count: number) => string;
    groupShowDates: (count: number) => string;
    dir: 'ltr' | 'rtl';
  }
> = {
  fr: {
    navPlanning: 'Planning',
    planningTitle: 'Planning hebdomadaire',
    auditTrigger: 'Audit du planning',
    pageTitle: 'Audit du planning',
    subtitle:
      'Séances déjà planifiées qui tombent désormais hors des horaires ou un jour férié. Vérifiez puis annulez au cas par cas.',
    reasonOutsideHours: 'Hors horaires',
    reasonHoliday: 'Jour férié',
    cancelRowBtn: 'Annuler la séance',
    dialogTitle: 'Annuler cette séance ?',
    dialogBody:
      'Seule cette séance sera retirée du planning. La séance hebdomadaire et les autres dates ne changent pas.',
    dialogConfirm: 'Annuler la séance',
    dialogBack: 'Retour',
    emptyTitle: 'Aucune séance hors horaires',
    emptySubtitle: 'Toutes les séances planifiées tiennent dans les horaires du centre et évitent les jours fériés.',
    groupRepeats: (count) => `Se répète chaque semaine (×${count})`,
    groupShowDates: (count) => `Voir les ${count} dates`,
    dir: 'ltr',
  },
  ar: {
    navPlanning: 'الجدولة',
    planningTitle: 'الجدول الأسبوعي',
    auditTrigger: 'تدقيق الجدولة',
    pageTitle: 'تدقيق الجدولة',
    subtitle: 'حصص مجدولة سابقًا صارت خارج ساعات العمل أو في يوم عطلة. راجعها ثم ألغِها واحدة تلو الأخرى.',
    reasonOutsideHours: 'خارج ساعات العمل',
    reasonHoliday: 'يوم عطلة',
    cancelRowBtn: 'إلغاء الحصة',
    dialogTitle: 'إلغاء هذه الحصة؟',
    dialogBody: 'سيتم إلغاء هذه الحصة فقط. تبقى الحصة الأسبوعية والتواريخ الأخرى دون تغيير.',
    dialogConfirm: 'إلغاء الحصة',
    dialogBack: 'رجوع',
    emptyTitle: 'لا توجد حصص خارج ساعات العمل',
    emptySubtitle: 'كل الحصص المجدولة تقع ضمن ساعات عمل المركز وتتجنّب أيام العطل.',
    groupRepeats: (count) => `يتكرر كل أسبوع (×${count})`,
    groupShowDates: (count) => `عرض التواريخ (${count})`,
    dir: 'rtl',
  },
};

export type Launched = { app: ElectronApplication; win: Page };
type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-schedule-audit-'));
}

/** A single weekly template plus the ids of the reference data it hangs off. */
export type Seeded = { recurringSessionId: string; roomId: string; teacherId: string; subjectId: string; groupId: string };

export async function launch(
  locale: Locale,
  options: { omitFeatures?: readonly string[] } = {},
): Promise<Launched> {
  const env: Record<string, string> = { ...process.env, CS_LOCALE: locale, CS_PLAN: 'premium' };
  delete env['CS_E2E_OMIT_FEATURES'];
  if (options.omitFeatures && options.omitFeatures.length > 0) {
    env['CS_E2E_OMIT_FEATURES'] = options.omitFeatures.join(',');
  }
  const app = await electron.launch({ args: [MAIN_ENTRY, `--user-data-dir=${freshUserDataDir()}`], env });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  const bw = await app.browserWindow(win);
  await bw.evaluate((w: { setBounds: (b: object) => void }) => w.setBounds({ x: 0, y: 0, width: 1500, height: 1200 }));
  await win.evaluate(async (admin) => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  return { app, win };
}

/**
 * Seed reference data, a Monday 15:00–17:00 recurring template, and materialize
 * its dated occurrences over [from,to]. Center hours are the un-wizarded default
 * (09:00–18:00 every open day), so a 15:00–17:00 occurrence is initially valid.
 */
export async function seedGeneratedSessions(win: Page, from: string, to: string): Promise<Seeded> {
  return win.evaluate(
    async (range) => {
      const api = (window as unknown as { api: Bridge }).api;
      const room = (await api.invoke('room.create', { name: 'Salle A', capacity: 20 })) as { id: string };
      const teacher = (await api.invoke('teacher.create', {
        name: { fr: 'Ahmed Benali', ar: 'أحمد بنعلي' },
        phone: '+212600000001',
        subjectIds: [],
      })) as { id: string };
      const subject = (await api.invoke('subject.create', {
        name: { fr: 'Mathématiques', ar: 'الرياضيات' },
        code: 'MATH',
      })) as { id: string };
      const group = (await api.invoke('group.create', {
        subjectId: subject.id,
        teacherId: teacher.id,
        level: '2 Bac SM',
        capacity: 15,
        kind: 'regular',
      })) as { id: string };
      const wrs = (await api.invoke('weeklySession.create', {
        roomId: room.id,
        teacherId: teacher.id,
        groupId: group.id,
        dayOfWeek: 1,
        start: '15:00',
        end: '17:00',
      })) as { id: string };
      await api.invoke('session.generate', { recurringSessionId: wrs.id, from: range.from, to: range.to });
      return {
        recurringSessionId: wrs.id,
        roomId: room.id,
        teacherId: teacher.id,
        subjectId: subject.id,
        groupId: group.id,
      };
    },
    { from, to },
  );
}

/** Narrow Monday to 09:00–14:00 across [start,end] — strands any 15:00–17:00 Monday occurrence in range. */
export async function narrowMondayOverride(win: Page, start: string, end: string): Promise<void> {
  await win.evaluate(
    async (range) => {
      const api = (window as unknown as { api: Bridge }).api;
      await api.invoke('centerHoursOverride.save', {
        dateRange: { start: range.start, end: range.end },
        hoursByWeekday: { 0: [], 1: [{ open: '09:00', close: '14:00' }], 2: [], 3: [], 4: [], 5: [], 6: [] },
      });
    },
    { start, end },
  );
}

/** Drop a single-day fixed holiday on `date`. */
export async function addHoliday(win: Page, date: string): Promise<void> {
  await win.evaluate(async (d) => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('holiday.create', {
      name: { fr: 'Fête du Trône', ar: 'عيد العرش' },
      kind: 'fixed',
      startDate: d,
      endDate: d,
    });
  }, date);
}

/** Read the live weekly read model (recurring templates) — persistence proof for the data-loss guard. */
export async function readWeek(
  win: Page,
): Promise<{ id: string; dayOfWeek: number; start: string; end: string }[]> {
  const res = (await win.evaluate(async () => {
    const api = (window as unknown as { api: Bridge }).api;
    return api.invoke('session.week', {});
  })) as { sessions: { id: string; dayOfWeek: number; start: string; end: string }[] };
  return res.sessions;
}

/**
 * Drive the audit through the planner (SOU-240): reload past the boot wizard /
 * auth gate into the shell, open the weekly planner via the sidebar, then click
 * the "Audit du planning" trigger in the header and wait for the review modal.
 * The button label may be suffixed by the count badge's number, so the role
 * match is a substring match (default), never exact.
 */
export async function gotoAudit(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  await win.getByRole('link', { name: L.navPlanning, exact: true }).click();
  await win.getByRole('heading', { name: L.planningTitle }).waitFor();
  await win.getByRole('button', { name: L.auditTrigger }).click();
  await win.getByRole('dialog').waitFor();
}

/** The audit modal's list rows (each stranded occurrence is one `<li>`). */
export function auditRows(win: Page) {
  return win.getByRole('dialog').locator('ul > li');
}

/** The row whose visible text contains a given localized date label. */
export function rowForDate(win: Page, dateLabel: string) {
  return win.getByRole('dialog').locator('ul > li', { hasText: dateLabel });
}

/** The cancel-occurrence confirm dialog — scoped by its title, since it stacks over the audit modal. */
export function confirmDialog(win: Page, title: string) {
  return win.locator('[role="dialog"]', { hasText: title });
}

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() =>
    /Something went wrong|Show Error|Hide Error|Une erreur est survenue|حدث خطأ/i.test(document.body.innerText),
  );
}
