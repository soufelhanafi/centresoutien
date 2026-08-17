import { _electron as electron, type Locator, type Page } from '@playwright/test';
import {
  STR as CH,
  VALID_ADMIN,
  freshUserDataDir,
  MAIN_ENTRY,
  type Launched,
  type Locale,
} from './center-hours.fixtures';

/**
 * Black-box fixtures for SOU-165 — dated center-hours override (Ramadan).
 *
 * Everything is driven through the running packaged app and the public preload
 * bridge (`window.api.invoke`) only — no renderer/domain/data implementation is
 * imported. Every asserted string is mirrored from the localization catalog
 * (`i18n/fr.json` / `ar.json`) — the user-facing contract.
 *
 * The override manager lives inside Settings → Horaires (below the static weekly
 * hours), as its own "Horaires exceptionnels" region. The planner (Planning
 * hebdomadaire) is a dayOfWeek grid with no in-UI date navigation, so it always
 * renders the current real week; "inside vs outside the override range" is
 * therefore exercised by whether the override's date range covers today.
 */

export { freshUserDataDir, VALID_ADMIN, type Launched, type Locale };

/** Override-specific copy, mirrored from i18n {fr,ar}.json (SOU-165). */
export const OV: Record<
  Locale,
  {
    settingsNav: string;
    dashboardNav: string;
    hoursTab: string;
    regionTitle: string;
    addPeriod: string;
    emptyTitle: string;
    formTitle: string;
    save: string;
    addWindow: string;
    removeWindow: string;
    createSuccess: string;
    archiveAction: string;
    archiveTitle: string;
    archiveConfirm: string;
    archiveSuccess: string;
    errWindowsOverlap: string;
    errCloseBeforeOpen: string;
    errOutsideWindows: string;
    errOutsideHoursGeneric: string;
    navPlanning: string;
    plannerTitle: string;
    newSession: string;
    createSession: string;
    cancel: string;
    roomLabel: string;
    switchLabel: (weekdayIndex: number) => string;
    dir: 'ltr' | 'rtl';
  }
> = {
  fr: {
    settingsNav: CH.fr.settingsNav,
    dashboardNav: CH.fr.dashboardNav,
    hoursTab: 'Horaires',
    regionTitle: 'Horaires exceptionnels',
    addPeriod: 'Ajouter une période',
    emptyTitle: 'Aucun horaire exceptionnel',
    formTitle: "Ajouter une période d'horaires exceptionnels",
    save: 'Enregistrer la période',
    addWindow: 'Ajouter un créneau',
    removeWindow: 'Supprimer le créneau',
    createSuccess: "Période d'horaires enregistrée",
    archiveAction: 'Supprimer cette période',
    archiveTitle: 'Supprimer les horaires exceptionnels ?',
    archiveConfirm: 'Supprimer',
    archiveSuccess: 'Période supprimée',
    errWindowsOverlap: "Les créneaux d'un même jour ne doivent pas se chevaucher",
    errCloseBeforeOpen: "La fermeture doit être après l'ouverture",
    errOutsideWindows: 'La séance tombe en dehors des horaires exceptionnels du centre (coupure de midi / iftar)',
    errOutsideHoursGeneric: "La séance est en dehors des horaires d'ouverture du centre",
    navPlanning: 'Planning',
    plannerTitle: 'Planning hebdomadaire',
    newSession: 'Nouvelle séance',
    createSession: 'Créer la séance',
    cancel: 'Annuler',
    roomLabel: 'Salle',
    switchLabel: (i) => CH.fr.toggleAria(CH.fr.weekdays[i]!),
    dir: 'ltr',
  },
  ar: {
    settingsNav: CH.ar.settingsNav,
    dashboardNav: CH.ar.dashboardNav,
    hoursTab: 'المواعيد',
    regionTitle: 'أوقات استثنائية',
    addPeriod: 'إضافة فترة',
    emptyTitle: 'لا توجد أوقات استثنائية',
    formTitle: 'إضافة فترة أوقات استثنائية',
    save: 'حفظ الفترة',
    addWindow: 'إضافة فترة زمنية',
    removeWindow: 'حذف الفترة الزمنية',
    createSuccess: 'تم حفظ فترة الأوقات',
    archiveAction: 'حذف هذه الفترة',
    archiveTitle: 'حذف الأوقات الاستثنائية؟',
    archiveConfirm: 'حذف',
    archiveSuccess: 'تم حذف الفترة',
    errWindowsOverlap: 'يجب ألّا تتداخل الفترات الزمنية في اليوم نفسه',
    errCloseBeforeOpen: 'يجب أن يكون وقت الإغلاق بعد وقت الفتح',
    errOutsideWindows: 'تقع الحصة خارج الأوقات الاستثنائية للمركز (استراحة الظهيرة / الإفطار)',
    errOutsideHoursGeneric: 'الحصة خارج أوقات عمل المركز',
    navPlanning: 'الجدولة',
    plannerTitle: 'الجدول الأسبوعي',
    newSession: 'حصة جديدة',
    createSession: 'إنشاء الحصة',
    cancel: 'إلغاء',
    roomLabel: 'القاعة',
    switchLabel: (i) => CH.ar.toggleAria(CH.ar.weekdays[i]!),
    dir: 'rtl',
  },
};

type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

/** `YYYY-MM-DD` from LOCAL date components — never `toISOString()`, whose UTC
 *  shift moves the civil date near midnight (the SOU-255 lesson). */
function isoDate(date: Date): string {
  const yyyy = String(date.getFullYear()).padStart(4, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function daysFromWeekStart(offset: number): string {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + offset);
  return isoDate(day);
}

/** The real Sunday-start week containing today (SOU-266): the app runs on the
 *  real clock and the planner renders the current week, so "the override covers
 *  the rendered week" must be computed at run time — a literal range rots the
 *  day the hardcoded week ends. */
export const CURRENT_WEEK = { start: daysFromWeekStart(0), end: daysFromWeekStart(6) };
/** A date range that does NOT cover the current week (four weeks later, non-overlapping). */
export const OTHER_WEEK = { start: daysFromWeekStart(28), end: daysFromWeekStart(34) };
export const MONDAY = 1;

/** Launch, size the window large enough that the tall override dialog fits fully in view, and get into the shell. */
export async function boot(locale: Locale): Promise<Launched> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${freshUserDataDir()}`],
    env: { ...process.env, CS_LOCALE: locale, CS_PLAN: 'premium' },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  await sizeWindow(app, win);
  await win.evaluate(async (admin) => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  await sizeWindow(app, win);
  return { app, win };
}

async function sizeWindow(app: Launched['app'], win: Page): Promise<void> {
  const bw = await app.browserWindow(win);
  await bw.evaluate((w: { setBounds: (b: object) => void }) => w.setBounds({ x: 0, y: 0, width: 1500, height: 1300 }));
}

export async function seedRoom(win: Page, name = 'Salle A'): Promise<void> {
  await win.evaluate(async (n) => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('room.create', { name: n, capacity: 20 });
  }, name);
}

export async function gotoHoursTab(win: Page, L: (typeof OV)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.settingsNav }).click();
  await win.getByRole('tab', { name: L.hoursTab }).click();
  await win.getByRole('region', { name: L.regionTitle }).waitFor();
}

export type WindowSpec = { open: string; close: string };

/**
 * Open the create-override dialog and fill it: a date range plus, for one
 * weekday, an ordered list of time windows (two windows models an iftar break).
 * Does NOT submit — the caller decides whether to save or to assert a rejection.
 */
export async function fillOverrideDialog(
  win: Page,
  L: (typeof OV)[Locale],
  opts: { start: string; end: string; weekday: number; windows: WindowSpec[] },
): Promise<Locator> {
  await win.getByRole('button', { name: L.addPeriod, exact: true }).first().click();
  const dialog = win.getByRole('dialog', { name: L.formTitle });
  await dialog.waitFor();
  await dialog.locator('input[name="startDate"]').fill(opts.start);
  await dialog.locator('input[name="endDate"]').fill(opts.end);
  await dialog.getByRole('switch', { name: L.switchLabel(opts.weekday) }).click();
  for (let w = 0; w < opts.windows.length; w += 1) {
    if (w > 0) await dialog.getByRole('button', { name: L.addWindow }).click();
    await dialog.locator(`input[name="days.${opts.weekday}.windows.${w}.open"]`).fill(opts.windows[w]!.open);
    await dialog.locator(`input[name="days.${opts.weekday}.windows.${w}.close"]`).fill(opts.windows[w]!.close);
  }
  return dialog;
}

export async function submitOverride(dialog: Locator, L: (typeof OV)[Locale]): Promise<void> {
  const save = dialog.getByRole('button', { name: L.save });
  await save.scrollIntoViewIfNeeded();
  await save.click();
}

export async function gotoPlanner(win: Page, L: (typeof OV)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navPlanning, exact: true }).click();
  await win.getByRole('heading', { name: L.plannerTitle }).waitFor();
}

/** All grayed "closed" overlays in the planner grid (decorative, no accessible name → matched by their muted style signature). */
export function closedOverlays(win: Page) {
  return win.locator('main div[aria-hidden="true"][style*="var(--muted)"]');
}

/** The mid-day iftar-gap overlay: a muted overlay positioned inside an open day column (carries a percentage `top:`). */
export function iftarGapOverlay(win: Page) {
  return win.locator('main div[aria-hidden="true"][style*="var(--muted)"][style*="top:"]');
}

/** Attempt to create a weekly session on `weekday` at [start,end] in a seeded room. Returns whether it was created (dialog closed). */
export async function tryCreateSession(
  win: Page,
  L: (typeof OV)[Locale],
  weekday: number,
  start: string,
  end: string,
): Promise<boolean> {
  await win.getByRole('button', { name: L.newSession }).click();
  const f = win.getByRole('dialog', { name: L.newSession });
  await f.waitFor();
  const times = f.locator('input[type="time"]');
  await times.nth(0).fill(start);
  await times.nth(1).fill(end);
  await f.getByRole('combobox', { name: L.roomLabel }).click();
  await win.getByRole('option', { name: 'Salle A' }).click();
  void weekday; // dayOfWeek defaults to Monday in the form; specs use Monday.
  await f.getByRole('button', { name: L.createSession }).click();
  await win.waitForTimeout(600);
  return (await f.count()) === 0;
}

export async function readWeek(win: Page): Promise<Array<{ dayOfWeek: number; start: string; end: string }>> {
  const res = (await win.evaluate(async () => {
    const api = (window as unknown as { api: Bridge }).api;
    return api.invoke('session.week', {});
  })) as { sessions: Array<{ dayOfWeek: number; start: string; end: string }> };
  return res.sessions;
}

export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}
