import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-317 — the teacher-detail "Groupes" tab: the active
 * groups a teacher currently leads (a group whose `teacherId` is this teacher),
 * each shown by subject (link to the group detail) + niveau, a kind badge, and an
 * enrolled/capacity seat-fill bar. UX mirrors the sibling SOU-299 "Élèves" tab: a
 * result count, a name search (subject in either script, or the level), and a kind
 * filter select shown only when the teacher leads BOTH a regular and an exam-prep
 * group. Filters compose with AND; states: empty / no-match / loading / error.
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer / use-case / adapter implementation is
 * imported. Reference data is seeded through the same public IPC channels the UI
 * uses; the specs then drive the tab and assert on localized user-facing copy.
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
export type Kind = 'regular' | 'exam-prep';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

export const SUB_START = '2025-09';
export const ENROLL_MONTH = '2025-09';

/** All copy the specs assert on, mirrored verbatim from i18n fr/ar.json (the
 *  same source the sibling SOU-299 fixtures mirror). */
export const STR: Record<
  Locale,
  {
    navTeachers: string;
    tabGroups: string;
    emptyTitle: string;
    emptyBody: string;
    noMatchTitle: string;
    searchLabel: string;
    kindLabel: string;
    allKinds: string;
    kindRegular: string;
    kindExamPrep: string;
    fillHeader: string;
  }
> = {
  fr: {
    navTeachers: 'Enseignants',
    tabGroups: 'Groupes',
    emptyTitle: 'Aucun groupe',
    emptyBody: "Cet enseignant n'anime encore aucun groupe.",
    noMatchTitle: 'Aucun résultat',
    searchLabel: 'Rechercher un groupe',
    kindLabel: 'Filtrer par type',
    allKinds: 'Tous les types',
    kindRegular: 'Régulier',
    kindExamPrep: 'Prépa examen',
    fillHeader: 'Effectif',
  },
  ar: {
    navTeachers: 'الأساتذة',
    tabGroups: 'المجموعات',
    emptyTitle: 'لا توجد مجموعات',
    emptyBody: 'لا يؤطّر هذا الأستاذ أي مجموعة بعد.',
    noMatchTitle: 'لا توجد نتائج',
    searchLabel: 'البحث عن مجموعة',
    kindLabel: 'التصفية حسب النوع',
    allKinds: 'كل الأنواع',
    kindRegular: 'عادي',
    kindExamPrep: 'تحضير الامتحان',
    fillHeader: 'العدد',
  },
};

/** Bilingual name pair; the UI shows the locale-appropriate one. */
export type Name = { fr: string; ar: string };
export const nameFor = (loc: Locale, n: Name): string => (loc === 'ar' ? n.ar : n.fr);

export const SUBJECTS = {
  math: { fr: 'Mathématiques', ar: 'الرياضيات', code: 'MATH' },
  phys: { fr: 'Physique', ar: 'الفيزياء', code: 'PHYS' },
} as const;

export const TEACHERS = {
  // Leads a regular AND an exam-prep group → kind filter is shown.
  both: { fr: 'Prof Deux', ar: 'أستاذ اثنان' },
  // Leads only regular groups → kind filter hidden (single-track).
  single: { fr: 'Prof Solo', ar: 'أستاذ منفرد' },
  // Leads no group → empty state.
  empty: { fr: 'Prof Vide', ar: 'أستاذ فارغ' },
  // A different teacher whose groups must NOT show under `both`'s tab.
  other: { fr: 'Prof Autre', ar: 'أستاذ آخر' },
} as const;

/** Levels used per group (a group is identified by subject + level). */
export const LEVELS = {
  mathReg: '3AC-A',
  physReg: '3AC-B',
  mathExam: 'BAC',
  singleReg: '1AC',
  otherReg: 'TC',
} as const;

/** Capacities chosen distinct so the enrolled/capacity fill is unambiguous. */
export const CAPS = { mathReg: 20, physReg: 15, mathExam: 10, singleReg: 12, otherReg: 8 } as const;

// Students seeded only to produce non-trivial enrolled counts in the fill bar.
export const STUDENTS = {
  a: { fr: 'Amine Un', ar: 'أمين واحد' },
  b: { fr: 'Bilal Deux', ar: 'بلال اثنان' },
  c: { fr: 'Chaimae Trois', ar: 'شيماء ثلاثة' },
} as const;

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-sou317-'));
}

export type Launched = { app: ElectronApplication; win: Page };

type Bridge = { invoke: (channel: string, request: unknown) => Promise<{ id: string }> };

export async function launch(locale: Locale, plan: PlanId, userDataDir: string): Promise<Launched> {
  const app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    env: { ...process.env, CS_LOCALE: locale, CS_PLAN: plan },
  });
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

/** Launch, seed admin, establish a remembered session, reload into the shell. */
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

export type Seeded = {
  bothId: string;
  singleId: string;
  emptyId: string;
  otherId: string;
};

/**
 * Seed the SOU-317 scenario through the public bridge.
 *
 *   BOTH teacher (two-track → kind filter shown):
 *     - Math regular   (3AC-A, cap 20) with 2 enrolled  → fill 2/20
 *     - Physique regular (3AC-B, cap 15) with 0 enrolled → fill 0/15
 *     - Math exam-prep (BAC,   cap 10) with 1 enrolled  → fill 1/10
 *   SINGLE teacher (regular only → kind filter hidden):
 *     - Math regular   (1AC, cap 12)
 *   EMPTY teacher → no group → empty state.
 *   OTHER teacher (regular Math, TC, cap 8) → must NOT show under BOTH's tab.
 */
export async function seedScenario(win: Page): Promise<Seeded> {
  return win.evaluate(
    async ({ SUBJECTS, TEACHERS, STUDENTS, LEVELS, CAPS, SUB_START, ENROLL_MONTH }) => {
      const api = (window as unknown as { api: Bridge }).api;

      let fmlSeq = 1;
      const formulaId = (): string => `fml_01HW${String(fmlSeq++).padStart(22, '0')}`;

      const subject = async (s: { fr: string; ar: string; code: string }) =>
        (await api.invoke('subject.create', { name: { fr: s.fr, ar: s.ar }, code: s.code })).id;
      const math = await subject(SUBJECTS.math);
      const phys = await subject(SUBJECTS.phys);

      const teacher = async (n: { fr: string; ar: string }, phone: string, subjectIds: string[]) =>
        (await api.invoke('teacher.create', { name: { fr: n.fr, ar: n.ar }, phone, subjectIds })).id;
      const bothId = await teacher(TEACHERS.both, '+212600000001', [math, phys]);
      const singleId = await teacher(TEACHERS.single, '+212600000002', [math]);
      const emptyId = await teacher(TEACHERS.empty, '+212600000003', [math]);
      const otherId = await teacher(TEACHERS.other, '+212600000004', [math]);

      const group = async (
        subjectId: string,
        teacherId: string,
        level: string,
        kind: 'regular' | 'exam-prep',
        capacity: number,
      ) => (await api.invoke('group.create', { subjectId, teacherId, level, capacity, kind })).id;

      const gMathReg = await group(math, bothId, LEVELS.mathReg, 'regular', CAPS.mathReg);
      const gPhysReg = await group(phys, bothId, LEVELS.physReg, 'regular', CAPS.physReg);
      const gMathExam = await group(math, bothId, LEVELS.mathExam, 'exam-prep', CAPS.mathExam);
      await group(math, singleId, LEVELS.singleReg, 'regular', CAPS.singleReg);
      await group(math, otherId, LEVELS.otherReg, 'regular', CAPS.otherReg);

      const student = async (n: { fr: string; ar: string }) =>
        (
          await api.invoke('student.create', {
            name: { fr: n.fr, ar: n.ar },
            birthDate: '2010-05-05',
            level: '3AC',
            school: null,
            notes: null,
            guardianIds: [],
          })
        ).id;

      const subscribe = async (studentId: string, kind: 'regular' | 'exam-prep', subjectId: string) => {
        await api.invoke('subscription.create', {
          studentId,
          formulaId: formulaId(),
          kind,
          subjectIds: [subjectId],
          startMonth: SUB_START,
          endMonth: null,
        });
      };

      const enroll = async (studentId: string, groupId: string) =>
        (await api.invoke('enrollment.create', { studentId, groupId, startMonth: ENROLL_MONTH, endMonth: null }))
          .id;

      // 2 enrolled in the regular Math group.
      const a = await student(STUDENTS.a);
      await subscribe(a, 'regular', math);
      await enroll(a, gMathReg);
      const b = await student(STUDENTS.b);
      await subscribe(b, 'regular', math);
      await enroll(b, gMathReg);

      // 1 enrolled in the exam-prep Math group.
      const c = await student(STUDENTS.c);
      await subscribe(c, 'exam-prep', math);
      await enroll(c, gMathExam);

      // gPhysReg intentionally has 0 enrolled.
      void gPhysReg;

      return { bothId, singleId, emptyId, otherId };
    },
    { SUBJECTS, TEACHERS, STUDENTS, LEVELS, CAPS, SUB_START, ENROLL_MONTH },
  );
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export async function gotoTeachers(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navTeachers, exact: true }).click();
}

/** Open a teacher's detail page from the list via its name link, then wait on the
 *  "Groupes" tab (the detail surface) rather than a fixed delay. */
export async function openTeacherDetail(win: Page, name: RegExp, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('row', { name }).getByRole('link').first().click();
  await win.getByRole('tab', { name: L.tabGroups }).waitFor({ state: 'visible' });
}

export async function openGroupsTab(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('tab', { name: L.tabGroups }).click();
}

/** Pick a value in a shadcn Select identified by its accessible (aria-label) name. */
export async function selectFilterValue(win: Page, filterLabel: string, optionText: string): Promise<void> {
  await win.getByRole('combobox', { name: filterLabel }).click();
  await win.getByRole('option', { name: optionText, exact: false }).first().click();
}

export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}
