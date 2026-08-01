import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import electronPath from 'electron';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-118 — Weekly planner grid on the real enriched
 * `session.week` (session ⋈ group ⋈ subject, + room + teacher).
 *
 * Driven only through the running packaged app and the public preload bridge
 * (`window.api.invoke`). The only strings referenced mirror the localization
 * catalog (`i18n/{fr,ar}.json` → `planning.*` / `nav.*`), the user-facing contract.
 *
 * SEED NOTE: the branch ships NO IPC channel and NO UI to create a weekly
 * recurring session (probed: `weeklySession.create` / `session.create` etc. are
 * unregistered; the planner's session dialog says "edit coming soon"). So the grid
 * can only be populated by writing `weekly_recurring_sessions` rows to the DB
 * directly — the seeding path the e2e skill (Step 3) explicitly endorses. Reference
 * data (subjects/rooms/teachers/groups) IS created through the public bridge; only
 * the sessions are inserted via the SQLCipher helper `sou118.seed.cjs`, run under
 * electron-as-node so its native ABI matches the packaged app.
 *
 * The app's DB config is env-overridable (see main/index.ts): we pin
 * centerCode=CS-DEV-001, key=dev-insecure-key, centreId=local so the helper opens
 * the same `centre-local.db`.
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');
const SEED_SCRIPT = join(dirname, 'sou118.seed.cjs');

export type Locale = 'fr' | 'ar';
export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

const DB_ENV = {
  CS_PLAN: 'premium',
  CS_CENTRE: 'local',
  CS_CENTER_CODE: 'CS-DEV-001',
  CS_DB_KEY: 'dev-insecure-key',
} as const;

/** Locale-stable seed identity: names as they must appear in each locale. */
export const DATA = {
  math: { fr: 'Mathématiques', ar: 'الرياضيات' },
  phys: { fr: 'Physique', ar: 'الفيزياء' },
  roomA: 'Salle A',
  roomB: 'Salle B',
  levelMath: '2 Bac SM',
  levelPhys: '1 Bac SE',
  teacherA: { fr: 'M. Alaoui', ar: 'السيد العلوي' },
  teacherB: { fr: 'Mme Bennani', ar: 'السيدة بناني' },
  teacherC: { fr: 'M. Cherkaoui', ar: 'السيد الشرقاوي' }, // ARCHIVED — must never appear
} as const;

/** Copy the specs assert on, mirrored from `planning.*` / `nav.*` in fr/ar.json. */
export const STR: Record<
  Locale,
  {
    navPlanning: string;
    title: string;
    subtitle: string;
    emptyWeek: string;
    emptyNoMatch: string;
    pe: string;
    filters: { teacher: string; teacherAll: string; room: string; roomAll: string; level: string; levelAll: string; kind: string; reset: string };
    kind: { regular: string; examPrep: string };
  }
> = {
  fr: {
    navPlanning: 'Planning',
    title: 'Planning hebdomadaire',
    subtitle: 'Visualisez les séances de la semaine par salle, enseignant et niveau.',
    emptyWeek: 'Aucune séance planifiée cette semaine.',
    emptyNoMatch: 'Aucune séance ne correspond à ces filtres.',
    pe: 'PE',
    filters: {
      teacher: 'Enseignant',
      teacherAll: 'Tous les enseignants',
      room: 'Salle',
      roomAll: 'Toutes les salles',
      level: 'Niveau',
      levelAll: 'Tous les niveaux',
      kind: 'Type',
      reset: 'Réinitialiser',
    },
    kind: { regular: 'Régulier', examPrep: 'Préparation examen' },
  },
  ar: {
    navPlanning: 'الجدولة',
    title: 'الجدول الأسبوعي',
    subtitle: 'اعرض حصص الأسبوع حسب القاعة والأستاذ والمستوى.',
    emptyWeek: 'لا توجد حصص مبرمجة هذا الأسبوع.',
    emptyNoMatch: 'لا توجد حصة تطابق عوامل التصفية.',
    pe: 'ت.إ',
    filters: {
      teacher: 'الأستاذ',
      teacherAll: 'كل الأساتذة',
      room: 'القاعة',
      roomAll: 'كل القاعات',
      level: 'المستوى',
      levelAll: 'كل المستويات',
      kind: 'النوع',
      reset: 'إعادة الضبط',
    },
    kind: { regular: 'عادي', examPrep: 'تحضير الامتحان' },
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-planner-'));
}

type Api = { invoke: (c: string, r: unknown) => Promise<unknown> };
export type Launched = { app: ElectronApplication; win: Page };

async function launch(locale: Locale, userDataDir: string): Promise<Launched> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ...DB_ENV, CS_LOCALE: locale },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

/**
 * Boot a fully-seeded planner: admin + reference data via the bridge, three weekly
 * sessions written to the DB, then a fresh app instance signed in (remembered
 * device) sitting on the shell. Sessions seeded:
 *   - Math (regular)   · Salle A · M. Alaoui   · 2 Bac SM · Mon 09:00 + Thu 14:00
 *   - Physique (exam-prep) · Salle B · Mme Bennani · 1 Bac SE · Wed 11:00 (PE)
 * M. Cherkaoui is created then archived — he must not appear in the teacher picker.
 */
export async function bootSeeded(locale: Locale): Promise<Launched> {
  const userDataDir = freshUserDataDir();
  const dbPath = join(userDataDir, 'centre-local.db');

  // Launch 1: reference data through the public bridge.
  const first = await launch(locale, userDataDir);
  const ids = await first.win.evaluate(async (admin) => {
    const api = (window as unknown as { api: Api }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
    const id = async (ch: string, p: unknown) => ((await api.invoke(ch, p)) as { id: string }).id;
    const math = await id('subject.create', { name: { fr: 'Mathématiques', ar: 'الرياضيات' } });
    const phys = await id('subject.create', { name: { fr: 'Physique', ar: 'الفيزياء' } });
    const roomA = await id('room.create', { name: 'Salle A', capacity: 20 });
    const roomB = await id('room.create', { name: 'Salle B', capacity: 15 });
    const tA = await id('teacher.create', { name: { fr: 'M. Alaoui', ar: 'السيد العلوي' }, phone: '0612345678' });
    const tB = await id('teacher.create', { name: { fr: 'Mme Bennani', ar: 'السيدة بناني' }, phone: '0698765432' });
    const tC = await id('teacher.create', { name: { fr: 'M. Cherkaoui', ar: 'السيد الشرقاوي' }, phone: '0611223344' });
    await api.invoke('teacher.archive', { id: tC });
    const gMath = await id('group.create', { subjectId: math, roomId: roomA, teacherId: tA, level: '2 Bac SM', capacity: 20, kind: 'regular' });
    const gPhys = await id('group.create', { subjectId: phys, roomId: roomB, teacherId: tB, level: '1 Bac SE', capacity: 15, kind: 'exam-prep' });
    return { roomA, roomB, tA, tB, gMath, gPhys };
  }, VALID_ADMIN);
  await first.app.close();

  // Seed the three weekly recurring sessions (no bridge/UI seam exists for these).
  const sessions = [
    { id: 'wrs_00000000000000000000000001', roomId: ids.roomA, teacherId: ids.tA, groupId: ids.gMath, dayOfWeek: 1, start: '09:00', end: '10:00' },
    { id: 'wrs_00000000000000000000000002', roomId: ids.roomB, teacherId: ids.tB, groupId: ids.gPhys, dayOfWeek: 3, start: '11:00', end: '12:00' },
    { id: 'wrs_00000000000000000000000003', roomId: ids.roomA, teacherId: ids.tA, groupId: ids.gMath, dayOfWeek: 4, start: '14:00', end: '15:00' },
  ];
  execFileSync(electronPath as unknown as string, [SEED_SCRIPT, dbPath, 'sessions', JSON.stringify(sessions)], {
    env: { ...process.env, ...DB_ENV, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
  });

  // Launch 2: signed in via remembered device.
  return launch(locale, userDataDir);
}

/** Boot with reference data + an archived teacher but NO sessions (empty grid). */
export async function bootEmpty(locale: Locale): Promise<Launched> {
  const userDataDir = freshUserDataDir();
  const first = await launch(locale, userDataDir);
  await first.win.evaluate(async (admin) => {
    const api = (window as unknown as { api: Api }).api;
    await api.invoke('admin.create', admin);
    await api.invoke('auth.login', { ...admin, rememberDevice: true });
  }, VALID_ADMIN);
  await first.app.close();
  return launch(locale, userDataDir);
}

export async function gotoPlanning(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navPlanning, exact: true }).click();
  await win.waitForTimeout(600);
}

/** All session blocks currently rendered in the grid (the coloured `border-s-[3px]` cards). */
export function sessionBlocks(win: Page) {
  return win.locator('[class*="border-s-[3px]"]');
}

/** Open a filter combobox and pick an option by its visible label. */
export async function pickFilter(win: Page, aria: string, option: string): Promise<void> {
  await win.getByRole('combobox', { name: aria }).click();
  await win.getByRole('option', { name: option, exact: true }).click();
  await win.waitForTimeout(300);
}

/** Labels present in a filter combobox's listbox (then closes it). */
export async function filterOptions(win: Page, aria: string): Promise<string[]> {
  await win.getByRole('combobox', { name: aria }).click();
  await win.waitForTimeout(200);
  const opts = await win.evaluate(() =>
    Array.from(document.querySelectorAll('[role="option"]')).map((o) => (o as HTMLElement).innerText.trim()),
  );
  await win.keyboard.press('Escape');
  await win.waitForTimeout(150);
  return opts;
}

export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}
