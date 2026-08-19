import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-283 — teacher-availability enforcement on session
 * scheduling.
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer / domain / data implementation is
 * imported. Every asserted string is mirrored from the localization catalog
 * (`i18n/fr.json` / `ar.json`) — the user-facing localization contract — exactly
 * as the SOU-131 planning and SOU-201 schedule-audit fixtures do.
 *
 * Reference data (room / teacher) and any precondition weekly sessions are
 * seeded through the SAME public IPC channels the app itself uses so the
 * create-session drawer's dropdowns are populated. Teacher availability rows are
 * seeded through the public `teacherAvailability.save` channel. The
 * feature is gated by `planning.teacher-availability` (present in every plan per
 * plans.ts); the suite runs on `premium` so the flag is ON.
 *
 * Launch switches (documented, shared with the sibling suites):
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

export type TimeWindow = { open: string; close: string };
/** A full week of availability windows, keyed 0..6 (Sunday..Saturday). Empty list = off that whole day. */
export type WeeklyWindows = Record<0 | 1 | 2 | 3 | 4 | 5 | 6, TimeWindow[]>;

export function emptyWeek(): WeeklyWindows {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

/** All copy the specs assert on, mirrored from i18n fr/ar.json. */
export const STR: Record<
  Locale,
  {
    navPlanning: string;
    navTeachers: string;
    planningTitle: string;
    weekdays: Record<number, string>;
    unknownSubject: string;
    emptyWeek: string;
    form: {
      new: string;
      day: string;
      start: string;
      end: string;
      room: string;
      teacher: string;
      create: string;
      createSuccess: string;
      scheduleAnyway: string;
    };
    warning: {
      title: string;
      /** Regex matching either availability warning message (out-of-window / generic). */
      message: RegExp;
    };
    availabilityTab: string;
    availability: {
      save: string;
      saved: string;
      toggle: (dayName: string) => string;
      recheckTitle: string;
      recheckDismiss: string;
    };
    audit: {
      trigger: string;
      pageTitle: string;
      reasonOutsideAvailability: string;
    };
  }
> = {
  fr: {
    navPlanning: 'Planning',
    navTeachers: 'Enseignants',
    planningTitle: 'Planning hebdomadaire',
    weekdays: { 0: 'Dimanche', 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi' },
    unknownSubject: 'Matière inconnue',
    emptyWeek: 'Aucune séance planifiée cette semaine.',
    form: {
      new: 'Nouvelle séance',
      day: 'Jour',
      start: 'Début',
      end: 'Fin',
      room: 'Salle',
      teacher: 'Enseignant',
      create: 'Créer la séance',
      createSuccess: 'Séance créée',
      scheduleAnyway: 'Programmer quand même',
    },
    warning: {
      title: 'Placement à confirmer',
      message: /en dehors des disponibilités déclarées de l'enseignant|n'est pas disponible sur ce créneau/,
    },
    availabilityTab: 'Disponibilités',
    availability: {
      save: 'Enregistrer les disponibilités',
      saved: 'Disponibilités enregistrées',
      toggle: (dayName) => `Basculer la disponibilité du ${dayName}`,
      recheckTitle: 'Séances désormais hors disponibilités',
      recheckDismiss: "J'ai compris",
    },
    audit: {
      trigger: 'Audit du planning',
      pageTitle: 'Audit du planning',
      reasonOutsideAvailability: "Hors disponibilités de l'enseignant",
    },
  },
  ar: {
    navPlanning: 'الجدولة',
    navTeachers: 'الأساتذة',
    planningTitle: 'الجدول الأسبوعي',
    weekdays: { 0: 'الأحد', 1: 'الإثنين', 2: 'الثلاثاء', 3: 'الأربعاء', 4: 'الخميس', 5: 'الجمعة', 6: 'السبت' },
    unknownSubject: 'مادة غير معروفة',
    emptyWeek: 'لا توجد حصص مبرمجة هذا الأسبوع.',
    form: {
      new: 'حصة جديدة',
      day: 'اليوم',
      start: 'البداية',
      end: 'النهاية',
      room: 'القاعة',
      teacher: 'الأستاذ',
      create: 'إنشاء الحصة',
      createSuccess: 'تم إنشاء الحصة',
      scheduleAnyway: 'برمجة رغم ذلك',
    },
    warning: {
      title: 'برمجة تحتاج إلى تأكيد',
      message: /خارج أوقات توفر الأستاذ المعلنة|غير متوفر في هذا التوقيت/,
    },
    availabilityTab: 'أوقات التوفر',
    availability: {
      save: 'حفظ أوقات التوفر',
      saved: 'تم حفظ أوقات التوفر',
      toggle: (dayName) => `تبديل توفر يوم ${dayName}`,
      recheckTitle: 'حصص أصبحت خارج أوقات التوفر',
      recheckDismiss: 'فهمت',
    },
    audit: {
      trigger: 'تدقيق الجدولة',
      pageTitle: 'تدقيق الجدولة',
      reasonOutsideAvailability: 'خارج أوقات توفر الأستاذ',
    },
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-availability-'));
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
  const bw = await app.browserWindow(win);
  await bw.evaluate((w: { setBounds: (b: object) => void }) => w.setBounds({ x: 0, y: 0, width: 1500, height: 1200 }));
  return { app, win };
}

export type SeededTeacher = { id: string; nameFr: string; nameAr: string };
export type Seeded = { roomId: string; roomName: string; teacher: SeededTeacher };

/**
 * Launch, clear the first-run + auth gates (no wizard → the default 09:00–18:00
 * center hours, so a mid-afternoon slot is always within center hours and the
 * ONLY thing that can strand it is teacher availability), and seed one room and
 * one teacher through the public bridge.
 */
export async function boot(locale: Locale, plan: PlanId = 'premium'): Promise<Launched & { seeded: Seeded }> {
  const live = await launch(locale, plan, freshUserDataDir());

  const seeded = (await live.win.evaluate(async (admin) => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });

    const room = (await api.invoke('room.create', { name: 'Salle A', capacity: 20 })) as { id: string };
    const teacher = (await api.invoke('teacher.create', {
      name: { fr: 'Ahmed Benali', ar: 'أحمد بنعلي' },
      phone: '+212600000001',
      subjectIds: [],
    })) as { id: string };

    return { roomId: room.id, roomName: 'Salle A', teacher: { id: teacher.id, nameFr: 'Ahmed Benali', nameAr: 'أحمد بنعلي' } };
  }, VALID_ADMIN)) as Seeded;

  await live.win.reload();
  await live.win.waitForLoadState('domcontentloaded');

  return { ...live, seeded };
}

/** Seed (upsert) a teacher's weekly availability row through the public save channel. */
export async function saveAvailability(win: Page, teacherId: string, weeklyWindows: WeeklyWindows): Promise<void> {
  await win.evaluate(
    async (input) => {
      const api = (window as unknown as { api: Bridge }).api;
      await api.invoke('teacherAvailability.save', { teacherId: input.teacherId, weeklyWindows: input.weeklyWindows });
    },
    { teacherId, weeklyWindows },
  );
}

/** Create a weekly recurring session directly through the public write channel — used to set up a precondition. */
export async function createWeeklySession(
  win: Page,
  input: { roomId: string; teacherId?: string | null; dayOfWeek: number; start: string; end: string },
): Promise<string> {
  const res = (await win.evaluate(async (i) => {
    const api = (window as unknown as { api: Bridge }).api;
    return api.invoke('weeklySession.create', {
      roomId: i.roomId,
      teacherId: i.teacherId ?? null,
      groupId: null,
      dayOfWeek: i.dayOfWeek,
      start: i.start,
      end: i.end,
    });
  }, input)) as { id: string };
  return res.id;
}

/** Seed a subject + group + weekly session and materialize its dated occurrences over [from,to] (audit precondition). */
export async function seedGeneratedSession(
  win: Page,
  input: { roomId: string; teacherId: string; dayOfWeek: number; start: string; end: string; from: string; to: string },
): Promise<{ recurringSessionId: string }> {
  return win.evaluate(async (i) => {
    const api = (window as unknown as { api: Bridge }).api;
    const subject = (await api.invoke('subject.create', {
      name: { fr: 'Mathématiques', ar: 'الرياضيات' },
      code: 'MATH',
    })) as { id: string };
    const group = (await api.invoke('group.create', {
      subjectId: subject.id,
      teacherId: i.teacherId,
      level: '2 Bac SM',
      capacity: 15,
      kind: 'regular',
    })) as { id: string };
    const wrs = (await api.invoke('weeklySession.create', {
      roomId: i.roomId,
      teacherId: i.teacherId,
      groupId: group.id,
      dayOfWeek: i.dayOfWeek,
      start: i.start,
      end: i.end,
    })) as { id: string };
    await api.invoke('session.generate', { recurringSessionId: wrs.id, from: i.from, to: i.to });
    return { recurringSessionId: wrs.id };
  }, input);
}

/** Read the live weekly read model (persistence proof) through the public channel. */
export async function readWeek(
  win: Page,
): Promise<{ id: string; dayOfWeek: number; start: string; end: string; teacherId: string | null }[]> {
  const res = (await win.evaluate(async () => {
    const api = (window as unknown as { api: Bridge }).api;
    return api.invoke('session.week', {});
  })) as { sessions: { id: string; dayOfWeek: number; start: string; end: string; teacherId: string | null }[] };
  return res.sessions;
}

/** Navigate to the weekly planner via the sidebar. */
export async function gotoPlanning(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navPlanning, exact: true }).click();
  await win.getByRole('heading', { name: L.planningTitle }).waitFor();
}

/** Navigate to a teacher's availability tab: sidebar → Teachers → row link → "Disponibilités" tab. */
export async function gotoTeacherAvailability(win: Page, L: (typeof STR)[Locale], teacherName: string): Promise<void> {
  await win.getByRole('link', { name: L.navTeachers, exact: true }).click();
  await win.getByRole('row', { name: teacherName }).getByRole('link', { name: teacherName }).first().click();
  await win.getByRole('tab', { name: L.availabilityTab }).click();
}

/** Open the create-session drawer from the planner header. */
export async function openCreate(win: Page, L: (typeof STR)[Locale]) {
  await win.getByRole('button', { name: L.form.new }).first().click();
  const dialog = win.getByRole('dialog');
  await dialog.waitFor();
  return dialog;
}

export async function pickOption(win: Page, dialog: ReturnType<Page['getByRole']>, comboName: string, optionName: string): Promise<void> {
  await dialog.getByRole('combobox', { name: comboName }).click();
  await win.getByRole('option', { name: optionName, exact: true }).click();
}

/**
 * Fill the create-session drawer: pick room, day, teacher and time. Day and
 * teacher are selected explicitly so the availability check has a subject.
 */
export async function fillSessionForm(
  win: Page,
  dialog: ReturnType<Page['getByRole']>,
  L: (typeof STR)[Locale],
  input: { room: string; teacher?: string; dayName?: string; start: string; end: string },
): Promise<void> {
  await pickOption(win, dialog, L.form.room, input.room);
  if (input.dayName) await pickOption(win, dialog, L.form.day, input.dayName);
  if (input.teacher) await pickOption(win, dialog, L.form.teacher, input.teacher);
  await win.getByLabel(L.form.start, { exact: false }).fill(input.start);
  await win.getByLabel(L.form.end, { exact: false }).fill(input.end);
}

/** Open the schedule audit modal from the planner header. */
export async function gotoAudit(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navPlanning, exact: true }).click();
  await win.getByRole('heading', { name: L.planningTitle }).waitFor();
  await win.getByRole('button', { name: L.audit.trigger }).click();
  await win.getByRole('dialog').waitFor();
}

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() =>
    /Something went wrong|Show Error|Hide Error|Une erreur est survenue|حدث خطأ/i.test(document.body.innerText),
  );
}
