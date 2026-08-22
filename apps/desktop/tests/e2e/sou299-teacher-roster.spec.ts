import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  DIRECTION,
  TEACHERS,
  STUDENTS,
  SUBJECTS,
  boot,
  seedScenario,
  gotoTeachers,
  openTeacherDetail,
  openStudentsTab,
  selectFilterValue,
  stubOpenPath,
  stubSaveDialog,
  freshExportDir,
  exportPath,
  isRealPdfFile,
  pageCrashed,
  nameFor,
  type Launched,
  type Locale,
} from './sou299-teacher-roster.fixtures';

/**
 * SOU-299 — teacher-detail "Élèves" tab. Black-box, driven only through the
 * running packaged app. Every scenario runs under both the `fr` (LTR) and `ar`
 * (RTL) Playwright projects unless intrinsically locale-specific.
 *
 * Verifies the acceptance criteria: distinct-student roster, dedupe across two
 * groups, AND-composing filters (+ subject filter shown only for multi-subject
 * teachers), empty state, the Parti(e) status, kind badges in one list, and a
 * FR PDF print/export that fires without error.
 */

const locale = () => test.info().project.name as Locale;
const isAr = () => locale() === 'ar';

let live: Launched | null = null;

test.beforeEach(async () => {
  live = await boot(locale());
  await seedScenario(live.win);
});
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

const rgx = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

/** Table body rows containing the given text (excludes the header row). */
function rowsWith(win: Page, text: string) {
  return win.getByRole('row').filter({ hasText: text });
}

async function openMultiRoster(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await gotoTeachers(win, L);
  await openTeacherDetail(win, rgx(nameFor(locale(), TEACHERS.multi)), L);
  await openStudentsTab(win, L);
  await expect(win.getByRole('heading', { name: L.students.title }).first()).toBeVisible();
}

// ---------------------------------------------------------------------------
// AC1 + AC2 + AC7 — the tab lists the distinct actively-enrolled students; a
// student in TWO of the teacher's groups appears ONCE; both kinds coexist in one
// list, each with its kind badge.
// ---------------------------------------------------------------------------
test('AC1/AC2/AC7 — distinct roster, single row for a two-group student, kind badges in one list', async () => {
  const L = STR[locale()];
  const win = live!.win;
  await openMultiRoster(win, L);

  const amine = nameFor(locale(), STUDENTS.dup);
  const bilal = nameFor(locale(), STUDENTS.exam);
  const chaimae = nameFor(locale(), STUDENTS.phys);
  const driss = nameFor(locale(), STUDENTS.left);

  await win.screenshot({ path: `test-results/sou299-roster-default-${locale()}.png` });

  // AC1 — the three actively-enrolled students are listed (default = Inscrits).
  await expect(rowsWith(win, amine)).toHaveCount(1); // AC2 — appears exactly ONCE
  await expect(win.getByText(bilal).first()).toBeVisible();
  await expect(win.getByText(chaimae).first()).toBeVisible();

  // AC5 (default view half) — the left student is NOT under the default Inscrits.
  await expect(win.getByText(driss)).toHaveCount(0);

  // AC7 — both kinds appear in the same list, each as a badge.
  await expect(win.getByText(L.students.kindRegular, { exact: true }).first()).toBeVisible();
  await expect(win.getByText(L.students.kindExamPrep, { exact: true }).first()).toBeVisible();

  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// AC3 — filters compose with AND (name + group + status); the subject filter is
// shown because the MULTI teacher teaches more than one subject.
// ---------------------------------------------------------------------------
test('AC3 — name + group + subject + status filters compose (AND); subject filter shown for multi-subject teacher', async () => {
  const L = STR[locale()];
  const win = live!.win;
  await openMultiRoster(win, L);

  const amine = nameFor(locale(), STUDENTS.dup);
  const chaimae = nameFor(locale(), STUDENTS.phys);
  const driss = nameFor(locale(), STUDENTS.left);

  // The subject filter is visible for a multi-subject teacher.
  await expect(win.getByRole('combobox', { name: L.students.subjectLabel })).toBeVisible();

  // Status = Tous → the left student now appears alongside the active ones.
  await selectFilterValue(win, L.students.statusLabel, L.students.statusAll);
  await expect(win.getByText(driss).first()).toBeVisible();
  await expect(win.getByText(amine).first()).toBeVisible();

  // AND with a name search → only Amine remains (assertions auto-wait on the
  // re-rendered roster; no fixed delay).
  await win.getByRole('textbox', { name: L.students.searchLabel }).fill(amine);
  await expect(rowsWith(win, amine)).toHaveCount(1);
  await expect(win.getByText(chaimae)).toHaveCount(0);
  await expect(win.getByText(driss)).toHaveCount(0);

  // Clear the name; AND with the subject filter (Physique) → only Chaimae.
  await win.getByRole('textbox', { name: L.students.searchLabel }).fill('');
  await selectFilterValue(win, L.students.subjectLabel, nameFor(locale(), SUBJECTS.phys));
  await expect(win.getByText(chaimae).first()).toBeVisible();
  await expect(win.getByText(amine)).toHaveCount(0);

  await win.screenshot({ path: `test-results/sou299-filters-and-${locale()}.png` });
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// AC3 (subject-filter visibility) — a single-subject teacher hides the subject
// filter (its roster spans only one subject) while keeping group + status.
// ---------------------------------------------------------------------------
test('AC3 — subject filter is hidden for a single-subject teacher', async () => {
  const L = STR[locale()];
  const win = live!.win;
  await gotoTeachers(win, L);
  await openTeacherDetail(win, rgx(nameFor(locale(), TEACHERS.single)), L);
  await openStudentsTab(win, L);

  await expect(win.getByText(nameFor(locale(), STUDENTS.solo)).first()).toBeVisible();
  // Subject filter absent; status filter still present.
  await expect(win.getByRole('combobox', { name: L.students.subjectLabel })).toHaveCount(0);
  await expect(win.getByRole('combobox', { name: L.students.statusLabel })).toBeVisible();

  await win.screenshot({ path: `test-results/sou299-single-subject-${locale()}.png` });
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// AC4 — a teacher with zero students shows the empty state.
// ---------------------------------------------------------------------------
test('AC4 — teacher with no students shows the empty state', async () => {
  const L = STR[locale()];
  const win = live!.win;
  await gotoTeachers(win, L);
  await openTeacherDetail(win, rgx(nameFor(locale(), TEACHERS.empty)), L);
  await openStudentsTab(win, L);

  await expect(win.getByText(L.students.emptyTitle).first()).toBeVisible();
  await expect(win.getByText(L.students.emptyBody).first()).toBeVisible();
  await win.screenshot({ path: `test-results/sou299-empty-${locale()}.png` });
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// AC5 — an unenrolled student shows a "Parti(e) — {mois}" status under Partis
// (and Tous), and is absent from the default Inscrits (asserted in AC1 above).
// ---------------------------------------------------------------------------
test('AC5 — unenrolled student shows Parti(e) under the Partis filter', async () => {
  const L = STR[locale()];
  const win = live!.win;
  await openMultiRoster(win, L);

  const driss = nameFor(locale(), STUDENTS.left);

  await selectFilterValue(win, L.students.statusLabel, L.students.statusLeft);
  const drissRow = rowsWith(win, driss);
  await expect(drissRow).toHaveCount(1);
  // The status badge reads "Parti(e)" (a prefix of "Parti(e) — {mois}").
  await expect(drissRow.getByText(L.students.statusLeftBadge, { exact: false })).toBeVisible();

  // The active students are excluded from the Partis filter.
  await expect(win.getByText(nameFor(locale(), STUDENTS.dup))).toHaveCount(0);

  await win.screenshot({ path: `test-results/sou299-parti-${locale()}.png` });
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// AC6 — the filtered list exports to a PDF (FR-only document) and prints without
// error. The save dialog + OS viewer are stubbed at the Electron boundary.
// ---------------------------------------------------------------------------
test('AC6 — filtered roster exports to a real PDF and prints without error', async () => {
  const L = STR[locale()];
  const win = live!.win;
  await stubOpenPath(live!.app);
  await openMultiRoster(win, L);

  // Export → save dialog stubbed to a known path → success toast + a real %PDF.
  const target = exportPath(freshExportDir(), `eleves-${locale()}.pdf`);
  await stubSaveDialog(live!.app, target);
  await win.getByRole('button', { name: L.students.exportButton }).click();
  await win.getByRole('menuitem', { name: L.students.exportPdf }).click();
  await expect(win.getByText(L.students.exportSuccess)).toBeVisible();
  await expect.poll(() => isRealPdfFile(target), { message: `expected a %PDF at ${target}` }).toBe(true);

  // Print → OS viewer stubbed → resolves to the success toast (no error).
  await win.getByRole('button', { name: L.students.exportButton }).click();
  await win.getByRole('menuitem', { name: L.students.print }).click();
  await expect(win.getByText(L.students.printSuccess)).toBeVisible();
  await expect(win.getByText(L.students.printError)).toHaveCount(0);

  await win.screenshot({ path: `test-results/sou299-export-${locale()}.png` });
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// AR-RTL — the teacher-detail surface mirrors (dir=rtl) with the roster present.
// ---------------------------------------------------------------------------
test('AR-RTL — the Élèves tab renders right-to-left', async () => {
  test.skip(!isAr(), 'RTL-specific scenario runs under the ar project');
  const L = STR[locale()];
  const win = live!.win;
  await openMultiRoster(win, L);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION.ar);
  await expect(win.getByText(nameFor('ar', STUDENTS.dup)).first()).toBeVisible();
  await win.screenshot({ path: 'test-results/sou299-ar-rtl.png' });
  expect(await pageCrashed(win)).toBe(false);
});
