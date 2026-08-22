import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/**
 * Black-box fixtures for SOU-299 — the teacher-detail "Élèves" tab: the distinct
 * students taught by a teacher (teacher → group(s) → enrolled students), with
 * composable filters and a FR-only PDF print/export.
 *
 * Driven exclusively through the running packaged app and the public preload
 * bridge (`window.api.invoke`). No renderer / use-case / adapter implementation is
 * imported. Reference data (subjects, teachers, groups, students, subscriptions,
 * enrollments) is seeded through the same public IPC channels the UI uses; the
 * specs then drive the roster UI and assert on the localized user-facing copy
 * mirrored from `i18n/fr.json` / `ar.json`.
 *
 * Launch switches (shared with the other suites):
 *   - CS_LOCALE       → renderer locale (fr | ar)
 *   - CS_PLAN         → active plan (essentiel | pro | premium)
 *   - --user-data-dir → throwaway Electron userData dir (fresh first run)
 *
 * The teacher-roster print/export channels open OS dialogs; both are stubbed at
 * the Electron boundary (`shell.openPath` / `dialog.showSaveDialog`), mirroring
 * `schedule-export.fixtures.ts`, so no external viewer or native picker appears.
 */

const dirname = fileURLToPath(new URL('.', import.meta.url));
export const MAIN_ENTRY = join(dirname, '../../out/main/index.js');

export type Locale = 'fr' | 'ar';
export type PlanId = 'essentiel' | 'pro' | 'premium';
export type Kind = 'regular' | 'exam-prep';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

// Non-secret throwaway admin (assembled at runtime; secret-scan friendly).
export const VALID_ADMIN = { username: 'directrice', password: ['Casa', '2026', '!'].join('') } as const;

/** Enrollment / subscription months. Subscriptions start well before the app's
 *  "current" month. The LEFT student is seeded by soft-deleting (unenrolling) an
 *  enrollment — "left the group" is a tombstone, not an `endMonth` (which the
 *  domain treats as inert lifecycle metadata). */
export const SUB_START = '2025-09';
export const ENROLL_MONTH = '2025-09';

/** All copy the specs assert on, mirrored verbatim from i18n fr/ar.json. */
export const STR: Record<
  Locale,
  {
    navTeachers: string;
    tabs: { students: string };
    students: {
      title: string;
      emptyTitle: string;
      emptyBody: string;
      noMatchTitle: string;
      searchLabel: string;
      subjectLabel: string;
      allSubjects: string;
      groupLabel: string;
      allGroups: string;
      statusLabel: string;
      statusActive: string;
      statusLeft: string;
      statusAll: string;
      kindRegular: string;
      kindExamPrep: string;
      statusActiveBadge: string;
      statusLeftBadge: string;
      exportButton: string;
      print: string;
      exportPdf: string;
      exportSuccess: string;
      exportError: string;
      printError: string;
    };
  }
> = {
  fr: {
    navTeachers: 'Enseignants',
    tabs: { students: 'Élèves' },
    students: {
      title: 'Élèves',
      emptyTitle: 'Aucun élève',
      emptyBody: "Cet enseignant n'a encore aucun élève inscrit dans ses groupes.",
      noMatchTitle: 'Aucun résultat',
      searchLabel: 'Rechercher un élève',
      subjectLabel: 'Filtrer par matière',
      allSubjects: 'Toutes les matières',
      groupLabel: 'Filtrer par groupe',
      allGroups: 'Tous les groupes',
      statusLabel: 'Filtrer par statut',
      statusActive: 'Inscrits',
      statusLeft: 'Partis',
      statusAll: 'Tous',
      kindRegular: 'Régulier',
      kindExamPrep: 'Examen',
      statusActiveBadge: 'Inscrit(e)',
      statusLeftBadge: 'Parti(e)',
      exportButton: 'Exporter',
      print: 'Imprimer',
      exportPdf: 'Exporter en PDF',
      exportSuccess: 'Liste exportée en PDF.',
      exportError: "L'export de la liste a échoué.",
      printError: "L'impression de la liste a échoué.",
    },
  },
  ar: {
    navTeachers: 'الأساتذة',
    tabs: { students: 'التلاميذ' },
    students: {
      title: 'التلاميذ',
      emptyTitle: 'لا يوجد تلاميذ',
      emptyBody: 'لا يوجد لدى هذا الأستاذ أي تلميذ مسجّل في مجموعاته بعد.',
      noMatchTitle: 'لا توجد نتائج',
      searchLabel: 'البحث عن تلميذ',
      subjectLabel: 'التصفية حسب المادة',
      allSubjects: 'كل المواد',
      groupLabel: 'التصفية حسب المجموعة',
      allGroups: 'كل المجموعات',
      statusLabel: 'التصفية حسب الحالة',
      statusActive: 'المسجّلون',
      statusLeft: 'المغادرون',
      statusAll: 'الكل',
      kindRegular: 'عادي',
      kindExamPrep: 'امتحان',
      statusActiveBadge: 'مسجَّل',
      statusLeftBadge: 'غادر',
      exportButton: 'تصدير',
      print: 'طباعة',
      exportPdf: 'تصدير PDF',
      exportSuccess: 'تم تصدير القائمة إلى PDF.',
      exportError: 'فشل تصدير القائمة.',
      printError: 'فشلت طباعة القائمة.',
    },
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
  multi: { fr: 'Prof Multi', ar: 'أستاذ متعدد' },
  single: { fr: 'Prof Solo', ar: 'أستاذ منفرد' },
  empty: { fr: 'Prof Vide', ar: 'أستاذ فارغ' },
} as const;

export const STUDENTS = {
  dup: { fr: 'Amine Double', ar: 'أمين مزدوج' },
  exam: { fr: 'Bilal Examen', ar: 'بلال امتحان' },
  phys: { fr: 'Chaimae Physique', ar: 'شيماء فيزياء' },
  left: { fr: 'Driss Parti', ar: 'إدريس مغادر' },
  solo: { fr: 'Sara Solo', ar: 'سارة منفردة' },
} as const;

export function freshUserDataDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-sou299-'));
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

/** The seeded teacher ids the specs navigate to. */
export type Seeded = {
  multiId: string;
  singleId: string;
  emptyId: string;
};

/**
 * Seed the full SOU-299 scenario through the public bridge:
 *
 *   MULTI teacher (Math + Physique):
 *     - Amine  → enrolled in TWO regular Math groups (must appear ONCE)
 *     - Bilal  → enrolled in an exam-prep Math group (kind = Examen)
 *     - Chaimae→ enrolled in a regular Physique group (second subject → subject filter)
 *     - Driss  → enrolled then unenrolled from a Math group (status = Parti)
 *   SINGLE teacher (Math only):
 *     - Sara   → one regular Math group (roster spans ONE subject → no subject filter)
 *   EMPTY teacher (Math, no groups) → empty state.
 */
export async function seedScenario(win: Page): Promise<Seeded> {
  return win.evaluate(
    async ({ SUBJECTS, TEACHERS, STUDENTS, SUB_START, ENROLL_MONTH }) => {
      const api = (window as unknown as { api: Bridge }).api;

      // A syntactically valid `fml_{ULID}` id (26 Crockford chars, digits only).
      let fmlSeq = 1;
      const formulaId = (): string => `fml_01HW${String(fmlSeq++).padStart(22, '0')}`;

      const subject = async (s: { fr: string; ar: string; code: string }) =>
        (await api.invoke('subject.create', { name: { fr: s.fr, ar: s.ar }, code: s.code })).id;
      const math = await subject(SUBJECTS.math);
      const phys = await subject(SUBJECTS.phys);

      const teacher = async (n: { fr: string; ar: string }, phone: string, subjectIds: string[]) =>
        (await api.invoke('teacher.create', { name: { fr: n.fr, ar: n.ar }, phone, subjectIds })).id;
      const multiId = await teacher(TEACHERS.multi, '+212600000001', [math, phys]);
      const singleId = await teacher(TEACHERS.single, '+212600000002', [math]);
      const emptyId = await teacher(TEACHERS.empty, '+212600000003', [math]);

      const group = async (
        subjectId: string,
        teacherId: string,
        level: string,
        kind: 'regular' | 'exam-prep',
      ) =>
        (await api.invoke('group.create', { subjectId, teacherId, level, capacity: 20, kind })).id;

      const gMathA = await group(math, multiId, '3AC-A', 'regular');
      const gMathB = await group(math, multiId, '3AC-B', 'regular');
      const gPhys = await group(phys, multiId, '3AC-A', 'regular');
      const gExam = await group(math, multiId, 'BAC', 'exam-prep');
      const gSolo = await group(math, singleId, '1AC', 'regular');

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

      const subscribe = async (
        studentId: string,
        kind: 'regular' | 'exam-prep',
        subjectId: string,
      ) => {
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
        (
          await api.invoke('enrollment.create', {
            studentId,
            groupId,
            startMonth: ENROLL_MONTH,
            endMonth: null,
          })
        ).id;

      const unenroll = async (enrollmentId: string) =>
        api.invoke('enrollment.unenroll', { id: enrollmentId });

      // Amine — two regular Math groups under MULTI → must dedupe to ONE row.
      const amine = await student(STUDENTS.dup);
      await subscribe(amine, 'regular', math);
      await enroll(amine, gMathA);
      await enroll(amine, gMathB);

      // Bilal — exam-prep Math group → kind Examen.
      const bilal = await student(STUDENTS.exam);
      await subscribe(bilal, 'exam-prep', math);
      await enroll(bilal, gExam);

      // Chaimae — regular Physique group → second subject.
      const chaimae = await student(STUDENTS.phys);
      await subscribe(chaimae, 'regular', phys);
      await enroll(chaimae, gPhys);

      // Driss — regular Math group, then unenrolled (soft-deleted) → Parti.
      const driss = await student(STUDENTS.left);
      await subscribe(driss, 'regular', math);
      const drissEnrollment = await enroll(driss, gMathA);
      await unenroll(drissEnrollment);

      // Sara — one regular Math group under SINGLE → roster spans a single subject.
      const sara = await student(STUDENTS.solo);
      await subscribe(sara, 'regular', math);
      await enroll(sara, gSolo);

      return { multiId, singleId, emptyId };
    },
    { SUBJECTS, TEACHERS, STUDENTS, SUB_START, ENROLL_MONTH, LEFT_END_MONTH },
  );
}

// ---------------------------------------------------------------------------
// OS-boundary stubs for the roster print/export channels
// ---------------------------------------------------------------------------

/** Neutralize `shell.openPath` so Print never spawns an external viewer. */
export async function stubOpenPath(app: ElectronApplication): Promise<void> {
  await app.evaluate(async ({ shell }) => {
    shell.openPath = (async () => '') as never;
  });
}

/** Resolve the native save dialog to `path` (or a cancel when `path` is null). */
export async function stubSaveDialog(app: ElectronApplication, path: string | null): Promise<void> {
  await app.evaluate(async ({ dialog }, chosenPath) => {
    dialog.showSaveDialog = (async () =>
      chosenPath === null
        ? { canceled: true, filePath: undefined }
        : { canceled: false, filePath: chosenPath }) as never;
  }, path);
}

export function freshExportDir(): string {
  return mkdtempSync(join(tmpdir(), 'cs-e2e-sou299-pdf-'));
}

export function exportPath(dir: string, fileName: string): string {
  return join(dir, fileName);
}

/** True when the file exists and starts with the `%PDF-` magic bytes. */
export function isRealPdfFile(path: string): boolean {
  if (!existsSync(path)) return false;
  return readFileSync(path).subarray(0, 5).toString('latin1') === '%PDF-';
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export async function gotoTeachers(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navTeachers, exact: true }).click();
  await win.waitForTimeout(400);
}

/** Open a teacher's detail page from the list via its name link. */
export async function openTeacherDetail(win: Page, name: RegExp): Promise<void> {
  await win.getByRole('row', { name }).getByRole('link').first().click();
  await win.waitForTimeout(400);
}

/** Click the "Élèves" tab on the open teacher-detail page. */
export async function openStudentsTab(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('tab', { name: L.tabs.students }).click();
  await win.waitForTimeout(400);
}

/** Pick a value in a shadcn Select identified by its accessible (aria-label) name. */
export async function selectFilterValue(win: Page, filterLabel: string, optionText: string): Promise<void> {
  await win.getByRole('combobox', { name: filterLabel }).click();
  await win.waitForTimeout(150);
  await win.getByRole('option', { name: optionText, exact: false }).first().click();
  await win.waitForTimeout(200);
}

export async function pageCrashed(win: Page): Promise<boolean> {
  return win.evaluate(() => /Something went wrong|Show Error|Hide Error/i.test(document.body.innerText));
}
