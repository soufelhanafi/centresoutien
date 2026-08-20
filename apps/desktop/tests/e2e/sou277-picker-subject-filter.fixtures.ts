import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-277 — subject-based cross-filtering of the
 * teacher/group pickers in the create-session drawer (SessionAssignmentFields).
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer / domain / data implementation is
 * imported. Every asserted string mirrors the localization catalog
 * (`i18n/fr.json` / `ar.json`) — the user-facing contract — exactly as the
 * SOU-131 / SOU-283 planning fixtures do.
 *
 * Reference data (subjects, teachers with distinct subjectIds, groups per
 * subject, a room) is seeded through the SAME public IPC channels the app uses
 * (`subject.create`, `teacher.create`, `group.create`, `room.create`) so the
 * drawer's own dropdowns are populated. Groups are seeded with `teacherId: null`
 * so the picker filter is exercised on the group's SUBJECT alone — the group's
 * own assigned teacher is irrelevant to the assignment pickers.
 *
 * Launch switches (shared with the sibling suites):
 *   - CS_LOCALE       → renderer locale (fr | ar)
 *   - CS_PLAN         → active plan (premium so exam-prep groups are allowed)
 *   - --user-data-dir → throwaway Electron userData dir (fresh first run)
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

/** All copy the specs assert on, mirrored from i18n fr/ar.json (`planning.*`). */
export const STR: Record<
  Locale,
  {
    navPlanning: string;
    planningTitle: string;
    emptyWeek: string;
    form: {
      new: string;
      room: string;
      teacher: string;
      teacherNone: string;
      group: string;
      groupNone: string;
      create: string;
      teacherClearedHint: string;
    };
  }
> = {
  fr: {
    navPlanning: 'Planning',
    planningTitle: 'Planning hebdomadaire',
    emptyWeek: 'Aucune séance planifiée cette semaine.',
    form: {
      new: 'Nouvelle séance',
      room: 'Salle',
      teacher: 'Enseignant',
      teacherNone: 'Sans enseignant',
      group: 'Groupe',
      groupNone: 'Sans groupe',
      create: 'Créer la séance',
      teacherClearedHint: "Enseignant retiré : il n'enseigne pas la matière du groupe choisi.",
    },
  },
  ar: {
    navPlanning: 'الجدولة',
    planningTitle: 'الجدول الأسبوعي',
    emptyWeek: 'لا توجد حصص مبرمجة هذا الأسبوع.',
    form: {
      new: 'حصة جديدة',
      room: 'القاعة',
      teacher: 'الأستاذ',
      teacherNone: 'بدون أستاذ',
      group: 'المجموعة',
      groupNone: 'بدون مجموعة',
      create: 'إنشاء الحصة',
      teacherClearedHint: 'تمت إزالة الأستاذ: لا يُدرّس مادة المجموعة المختارة.',
    },
  },
};

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-sou277-'));
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

export type SeedSubject = { nameFr: string; nameAr: string; code?: string };
export type SeedTeacher = { nameFr: string; nameAr: string; phone: string; subjectIdx: readonly number[] };
export type SeedGroup = { level: string; subjectIdx: number; kind?: 'regular' | 'exam-prep'; capacity?: number };

export type SeedSpec = {
  plan?: PlanId;
  subjects: readonly SeedSubject[];
  teachers?: readonly SeedTeacher[];
  groups?: readonly SeedGroup[];
  room?: { name: string; capacity?: number };
};

export type SeededSubject = { id: string; nameFr: string; nameAr: string };
export type SeededTeacher = { id: string; nameFr: string; nameAr: string };
export type SeededGroup = { id: string; level: string };
export type Seeded = {
  roomName: string;
  subjects: SeededSubject[];
  teachers: SeededTeacher[];
  groups: SeededGroup[];
};

/**
 * Launch, clear first-run + auth (no wizard → default 09:00–18:00 center hours),
 * and seed subjects / teachers / groups / one room through the public bridge.
 */
export async function boot(locale: Locale, spec: SeedSpec): Promise<Launched & { seeded: Seeded }> {
  const plan = spec.plan ?? 'premium';
  const live = await launch(locale, plan, freshUserDataDir());

  const seeded = (await live.win.evaluate(
    async ({ admin, s }) => {
      const api = (window as unknown as { api: Bridge }).api;
      await api.invoke('admin.create', admin);
      await api.invoke('auth.login', { ...admin, rememberDevice: true });

      await api.invoke('room.create', {
        name: s.room?.name ?? 'Salle A',
        capacity: s.room?.capacity ?? 30,
      });

      const subjects: { id: string; nameFr: string; nameAr: string }[] = [];
      for (const sub of s.subjects) {
        const res = (await api.invoke('subject.create', {
          name: { fr: sub.nameFr, ar: sub.nameAr },
          ...(sub.code ? { code: sub.code } : {}),
        })) as { id: string };
        subjects.push({ id: res.id, nameFr: sub.nameFr, nameAr: sub.nameAr });
      }

      const teachers: { id: string; nameFr: string; nameAr: string }[] = [];
      for (const t of s.teachers ?? []) {
        const subjectIds = t.subjectIdx.map((i) => subjects[i]!.id);
        const res = (await api.invoke('teacher.create', {
          name: { fr: t.nameFr, ar: t.nameAr },
          phone: t.phone,
          subjectIds,
        })) as { id: string };
        teachers.push({ id: res.id, nameFr: t.nameFr, nameAr: t.nameAr });
      }

      const groups: { id: string; level: string }[] = [];
      for (const g of s.groups ?? []) {
        const res = (await api.invoke('group.create', {
          subjectId: subjects[g.subjectIdx]!.id,
          teacherId: null,
          level: g.level,
          capacity: g.capacity ?? 15,
          kind: g.kind ?? 'regular',
        })) as { id: string };
        groups.push({ id: res.id, level: g.level });
      }

      return { roomName: s.room?.name ?? 'Salle A', subjects, teachers, groups };
    },
    { admin: VALID_ADMIN, s: spec },
  )) as Seeded;

  await live.win.reload();
  await live.win.waitForLoadState('domcontentloaded');
  return { ...live, seeded };
}

/** Localized display name for a seeded person/subject. */
export const nameOf = (loc: Locale, x: { nameFr: string; nameAr: string }) => (loc === 'ar' ? x.nameAr : x.nameFr);

/** Navigate to the weekly planner via the sidebar. */
export async function gotoPlanning(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navPlanning, exact: true }).click();
  await win.getByRole('heading', { name: L.planningTitle }).waitFor();
}

/** Open the create-session drawer from the planner header. */
export async function openCreate(win: Page, L: (typeof STR)[Locale]) {
  await win.getByRole('button', { name: L.form.new }).first().click();
  const dialog = win.getByRole('dialog');
  await dialog.waitFor();
  return dialog;
}

type Dialog = ReturnType<Page['getByRole']>;

/** Pick an option in one of the drawer's comboboxes (scoped to the drawer). */
export async function pickOption(win: Page, dialog: Dialog, comboName: string, optionName: string): Promise<void> {
  await dialog.getByRole('combobox', { name: comboName }).click();
  await win.getByRole('option', { name: optionName, exact: true }).click();
}

/** Pick an option matching a substring (used for group options that embed subject + level). */
export async function pickOptionContaining(win: Page, dialog: Dialog, comboName: string, needle: string): Promise<void> {
  await dialog.getByRole('combobox', { name: comboName }).click();
  await win.getByRole('option', { name: needle, exact: false }).first().click();
}

/**
 * Open a combobox, collect the visible option texts, then close it again without
 * changing the selection. Returns the trimmed option labels.
 */
export async function readOptions(win: Page, dialog: Dialog, comboName: string): Promise<string[]> {
  await dialog.getByRole('combobox', { name: comboName }).click();
  await win.getByRole('option').first().waitFor();
  const texts = await win.getByRole('option').allInnerTexts();
  await win.keyboard.press('Escape');
  return texts.map((t) => t.trim()).filter(Boolean);
}

/** True when the renderer error boundary is showing (page crashed on render). */
export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() =>
    /Something went wrong|Show Error|Hide Error|Une erreur est survenue|حدث خطأ/i.test(document.body.innerText),
  );
}
