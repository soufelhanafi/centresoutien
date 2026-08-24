import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  DIRECTION,
  SUBJECTS,
  TEACHERS,
  LEVELS,
  CAPS,
  boot,
  seedScenario,
  gotoTeachers,
  openTeacherDetail,
  openGroupsTab,
  selectFilterValue,
  pageCrashed,
  nameFor,
  type Launched,
  type Locale,
} from './sou317-teacher-groups.fixtures';

/**
 * SOU-317 — teacher-detail "Groupes" tab. Black-box, driven only through the
 * running packaged app. Every scenario runs under both the `fr` (LTR) and `ar`
 * (RTL) Playwright projects unless intrinsically locale-specific.
 *
 * Verifies the acceptance criteria: the tab lists exactly the active groups THIS
 * teacher currently leads (subject link + niveau sub-line, kind badge, and an
 * enrolled/capacity seat-fill), excluding other teachers' groups; a name search
 * (subject in either script or the level); a kind filter shown ONLY for a
 * two-track teacher; AND-composing filters; empty and no-match states; and the
 * subject link navigating to the group detail.
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

async function openTeacherGroups(win: Page, teacher: { fr: string; ar: string }, L: (typeof STR)[Locale]) {
  await gotoTeachers(win, L);
  await openTeacherDetail(win, rgx(nameFor(locale(), teacher)), L);
  await openGroupsTab(win, L);
}

// ---------------------------------------------------------------------------
// AC1 — the tab lists exactly the active groups THIS teacher leads (subject +
// niveau + kind badge + enrolled/capacity fill), and excludes other teachers'
// groups.
// ---------------------------------------------------------------------------
test('AC1 — lists only this teacher\'s groups with subject, niveau, kind badge and fill', async () => {
  const L = STR[locale()];
  const win = live!.win;
  await openTeacherGroups(win, TEACHERS.both, L);

  const mathName = nameFor(locale(), SUBJECTS.math);
  const physName = nameFor(locale(), SUBJECTS.phys);

  await win.screenshot({ path: `test-results/sou317-groups-default-${locale()}.png` });

  // Exactly the three groups the BOTH teacher leads (Math reg, Phys reg, Math exam).
  await expect(rowsWith(win, LEVELS.mathReg)).toHaveCount(1);
  await expect(rowsWith(win, LEVELS.physReg)).toHaveCount(1);
  await expect(rowsWith(win, LEVELS.mathExam)).toHaveCount(1);

  // Subject names appear (Math twice — regular + exam — and Physique once).
  await expect(win.getByText(mathName).first()).toBeVisible();
  await expect(win.getByText(physName).first()).toBeVisible();

  // Kind badges: both Régulier and Prépa examen present in the one list.
  await expect(win.getByText(L.kindRegular, { exact: true }).first()).toBeVisible();
  await expect(win.getByText(L.kindExamPrep, { exact: true }).first()).toBeVisible();

  // Enrolled/capacity fill per row (GroupFill = "{enrolled} / {capacity}").
  await expect(rowsWith(win, LEVELS.mathReg).getByText(rgx(`/ ${CAPS.mathReg}`)).first()).toBeVisible();
  await expect(rowsWith(win, LEVELS.physReg).getByText(rgx(`/ ${CAPS.physReg}`)).first()).toBeVisible();
  await expect(rowsWith(win, LEVELS.mathExam).getByText(rgx(`/ ${CAPS.mathExam}`)).first()).toBeVisible();

  // Isolation: the OTHER teacher's group (level TC) is NOT shown here.
  await expect(win.getByText(LEVELS.otherReg)).toHaveCount(0);
  // The SINGLE teacher's group (level 1AC) is NOT shown here either.
  await expect(win.getByText(LEVELS.singleReg)).toHaveCount(0);

  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// AC2 — name search filters by subject (either script) or by level; the kind
// filter is shown for a two-track teacher and filters correctly; filters
// compose with AND.
// ---------------------------------------------------------------------------
test('AC2 — name search + kind filter compose (AND); kind filter shown for a two-track teacher', async () => {
  const L = STR[locale()];
  const win = live!.win;
  await openTeacherGroups(win, TEACHERS.both, L);

  // Kind filter is visible for a teacher leading both a regular and an exam-prep group.
  await expect(win.getByRole('combobox', { name: L.kindLabel })).toBeVisible();

  // Search by level → only the Physique regular group (3AC-B).
  const search = win.getByRole('textbox', { name: L.searchLabel });
  await search.fill(LEVELS.physReg);
  await expect(rowsWith(win, LEVELS.physReg)).toHaveCount(1);
  await expect(win.getByText(LEVELS.mathReg)).toHaveCount(0);
  await expect(win.getByText(LEVELS.mathExam)).toHaveCount(0);

  // Search by subject name (Math, in the active script) → the two Math groups.
  await search.fill(nameFor(locale(), SUBJECTS.math));
  await expect(rowsWith(win, LEVELS.mathReg)).toHaveCount(1);
  await expect(rowsWith(win, LEVELS.mathExam)).toHaveCount(1);
  await expect(win.getByText(LEVELS.physReg)).toHaveCount(0);

  // AND the kind filter (Régulier) → only the regular Math group remains.
  await selectFilterValue(win, L.kindLabel, L.kindRegular);
  await expect(rowsWith(win, LEVELS.mathReg)).toHaveCount(1);
  await expect(win.getByText(LEVELS.mathExam)).toHaveCount(0);

  // Switch kind to Prépa examen (keep the Math search) → only the exam-prep group.
  await selectFilterValue(win, L.kindLabel, L.kindExamPrep);
  await expect(rowsWith(win, LEVELS.mathExam)).toHaveCount(1);
  await expect(win.getByText(LEVELS.mathReg)).toHaveCount(0);

  await win.screenshot({ path: `test-results/sou317-filters-and-${locale()}.png` });
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// AC2 (kind-filter visibility) — a single-track teacher (regular groups only)
// hides the kind filter.
// ---------------------------------------------------------------------------
test('AC2 — kind filter hidden for a single-track teacher', async () => {
  const L = STR[locale()];
  const win = live!.win;
  await openTeacherGroups(win, TEACHERS.single, L);

  await expect(rowsWith(win, LEVELS.singleReg)).toHaveCount(1);
  await expect(win.getByRole('combobox', { name: L.kindLabel })).toHaveCount(0);

  await win.screenshot({ path: `test-results/sou317-single-track-${locale()}.png` });
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// AC3 — a teacher who leads no group shows the empty state.
// ---------------------------------------------------------------------------
test('AC3 — teacher with no group shows the empty state', async () => {
  const L = STR[locale()];
  const win = live!.win;
  await openTeacherGroups(win, TEACHERS.empty, L);

  await expect(win.getByText(L.emptyTitle).first()).toBeVisible();
  await expect(win.getByText(L.emptyBody).first()).toBeVisible();
  await win.screenshot({ path: `test-results/sou317-empty-${locale()}.png` });
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// AC4 — filters that match nothing show the no-match state.
// ---------------------------------------------------------------------------
test('AC4 — a search matching nothing shows the no-match state', async () => {
  const L = STR[locale()];
  const win = live!.win;
  await openTeacherGroups(win, TEACHERS.both, L);

  await win.getByRole('textbox', { name: L.searchLabel }).fill('zzz-aucun-groupe-xyz');
  await expect(win.getByText(L.noMatchTitle).first()).toBeVisible();
  await expect(win.getByText(LEVELS.mathReg)).toHaveCount(0);

  await win.screenshot({ path: `test-results/sou317-nomatch-${locale()}.png` });
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// AC5 — the subject link navigates to the group detail (/groups/$groupId).
// ---------------------------------------------------------------------------
test('AC5 — the subject link opens the group detail', async () => {
  const L = STR[locale()];
  const win = live!.win;
  await openTeacherGroups(win, TEACHERS.both, L);

  // Follow the subject link in the regular-Math row.
  await rowsWith(win, LEVELS.mathReg).getByRole('link').first().click();
  await expect.poll(() => win.evaluate(() => window.location.hash)).toContain('groups/');

  await win.screenshot({ path: `test-results/sou317-group-detail-${locale()}.png` });
  expect(await pageCrashed(win)).toBe(false);
});

// ---------------------------------------------------------------------------
// AR-RTL — the Groupes tab mirrors (dir=rtl) with the roster present.
// ---------------------------------------------------------------------------
test('AR-RTL — the Groupes tab renders right-to-left', async () => {
  test.skip(!isAr(), 'RTL-specific scenario runs under the ar project');
  const L = STR[locale()];
  const win = live!.win;
  await openTeacherGroups(win, TEACHERS.both, L);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION.ar);
  await expect(win.getByText(nameFor('ar', SUBJECTS.math)).first()).toBeVisible();
  await win.screenshot({ path: 'test-results/sou317-ar-rtl.png' });
  expect(await pageCrashed(win)).toBe(false);
});
