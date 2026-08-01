import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  DIRECTION,
  boot,
  gotoTeachers,
  pageCrashed,
  subjectName,
  type Launched,
  type Locale,
  type CreatedSubject,
} from './teacher-subjects.fixtures';

/**
 * SOU-124 (frontend half) — teacher ↔ subject wiring. Black-box, driven only
 * through the running packaged app. Every spec runs under both the `fr` (LTR)
 * and `ar` (RTL) Playwright projects.
 *
 * Acceptance criteria under test (the KICKOFF "then (frontend)" list):
 *   1. Real subject filter on the teacher list (replaces the disabled
 *      "coming soon" placeholder) — sourced from configured subjects.
 *   2. A Subjects detail tab resolving a teacher's subjectIds → names.
 *   3. A subject multi-select in the teacher create/edit form.
 * All in FR + AR/RTL, with empty states, and fully offline.
 */

const locale = () => test.info().project.name as Locale;

let live: (Launched & { subjects: CreatedSubject[] }) | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

const MATH = { nameFr: 'Mathématiques', nameAr: 'الرياضيات', code: 'MATH' };
const PHYS = { nameFr: 'Physique', nameAr: 'الفيزياء', code: 'PHYS' };
const SVT = { nameFr: 'SVT', nameAr: 'علوم الحياة والأرض', code: 'SVT' };

async function assertListMounted(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  expect(await pageCrashed(win), 'Teachers page rendered without the "Something went wrong" error boundary').toBe(false);
  await expect(win.getByRole('heading', { level: 1, name: L.title })).toBeVisible();
}

/** Open the subject filter combobox and pick an option by its localized name. */
async function selectSubjectFilter(win: Page, L: (typeof STR)[Locale], optionName: string): Promise<void> {
  await win.getByRole('combobox', { name: L.filters.subjectLabel }).click();
  await win.getByRole('option', { name: optionName, exact: true }).click();
}

/** Open the create dialog, fill identity, toggle the given subject checkboxes, submit. */
async function createTeacher(
  win: Page,
  L: (typeof STR)[Locale],
  t: { nameFr: string; nameAr: string; phone: string; subjects?: readonly string[] },
): Promise<void> {
  await win.getByRole('button', { name: L.newBtn }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(L.form.nameFr, { exact: false }).fill(t.nameFr);
  await dialog.getByLabel(L.form.nameAr, { exact: false }).fill(t.nameAr);
  await dialog.getByLabel(L.form.phone, { exact: false }).first().fill(t.phone);
  for (const s of t.subjects ?? []) {
    await dialog.getByRole('checkbox', { name: s, exact: true }).click();
  }
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expect(win.getByText(L.form.createSuccess).first()).toBeVisible();
  await expect(dialog).toBeHidden();
}

/** From the list, open a teacher's detail page via the name link. */
async function openDetail(win: Page, name: RegExp): Promise<void> {
  await win.getByRole('row', { name }).getByRole('link', { name }).first().click();
}

// ---------------------------------------------------------------------------
// Scenario 1 — the teacher list exposes a REAL subject filter (a combobox
// populated from configured subjects), not a disabled "coming soon" stub.
// Maps to acceptance criterion #1.
// ---------------------------------------------------------------------------
test('Scenario 1 — teacher list shows a real subject filter populated from configured subjects', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { subjects: [MATH, PHYS, SVT] });
  const win = live.win;
  await gotoTeachers(win, L);
  await assertListMounted(win, L);

  const filter = win.getByRole('combobox', { name: L.filters.subjectLabel });
  await expect(filter).toBeVisible();
  await expect(filter).toBeEnabled();
  // Default option is "all subjects".
  await expect(filter).toContainText(L.filters.subjectAll);

  // Opening it lists the all-option + each configured subject by name.
  await filter.click();
  await expect(win.getByRole('option', { name: L.filters.subjectAll, exact: true })).toBeVisible();
  for (const s of [MATH, PHYS, SVT]) {
    await expect(win.getByRole('option', { name: subjectName(locale(), s), exact: true })).toBeVisible();
  }
  await win.screenshot({ path: `test-results/teacher-filter-open-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 2 — filtering by subject narrows the list to teachers who teach it.
// Maps to acceptance criterion #1 (behavior).
// ---------------------------------------------------------------------------
test('Scenario 2 — filtering by subject narrows the teacher list', async () => {
  const L = STR[locale()];
  live = await boot(locale(), {
    subjects: [MATH, PHYS],
    teachers: [
      { nameFr: 'Karim Idrissi', nameAr: 'كريم الإدريسي', phone: '0612345678', subjectIdx: [0] }, // Math
      { nameFr: 'Nadia Fassi', nameAr: 'نادية الفاسي', phone: '0623456789', subjectIdx: [1] }, // Physique
    ],
  });
  const win = live.win;
  await gotoTeachers(win, L);
  await assertListMounted(win, L);

  await expect(win.getByRole('row', { name: /Karim Idrissi/ })).toBeVisible();
  await expect(win.getByRole('row', { name: /Nadia Fassi/ })).toBeVisible();

  await selectSubjectFilter(win, L, subjectName(locale(), MATH));
  await expect(win.getByRole('row', { name: /Karim Idrissi/ })).toBeVisible();
  await expect(win.getByRole('row', { name: /Nadia Fassi/ })).toHaveCount(0);
  await win.screenshot({ path: `test-results/teacher-filtered-${locale()}.png` });

  await selectSubjectFilter(win, L, subjectName(locale(), PHYS));
  await expect(win.getByRole('row', { name: /Nadia Fassi/ })).toBeVisible();
  await expect(win.getByRole('row', { name: /Karim Idrissi/ })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Scenario 3 — create a teacher via the form's subject multi-select; the row
// reflects the subject count, and the phone is normalized to E.164.
// Maps to acceptance criterion #3.
// ---------------------------------------------------------------------------
test('Scenario 3 — create a teacher choosing subjects in the multi-select', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { subjects: [MATH, PHYS] });
  const win = live.win;
  await gotoTeachers(win, L);
  await assertListMounted(win, L);

  await createTeacher(win, L, {
    nameFr: 'Karim Idrissi',
    nameAr: 'كريم الإدريسي',
    phone: '0612345678',
    subjects: [subjectName(locale(), MATH), subjectName(locale(), PHYS)],
  });
  await win.screenshot({ path: `test-results/teacher-created-${locale()}.png` });

  const row = win.getByRole('row', { name: /Karim Idrissi/ });
  await expect(row).toBeVisible();
  // Malformed/local phone normalized to E.164 for display.
  await expect(row).toContainText('+212612345678');

  // The chosen subjects persisted: the detail Subjects tab resolves both names.
  await openDetail(win, /Karim Idrissi/);
  await win.getByRole('tab', { name: L.detail.tabs.subjects }).click();
  const panel = win.getByRole('tabpanel', { name: L.detail.tabs.subjects });
  await expect(panel.getByText(subjectName(locale(), MATH), { exact: false })).toBeVisible();
  await expect(panel.getByText(subjectName(locale(), PHYS), { exact: false })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 4 — the teacher detail Subjects tab resolves subjectIds → names.
// Maps to acceptance criterion #2.
// ---------------------------------------------------------------------------
test('Scenario 4 — detail Subjects tab resolves assigned subjects to names', async () => {
  const L = STR[locale()];
  live = await boot(locale(), {
    subjects: [MATH, PHYS],
    teachers: [{ nameFr: 'Karim Idrissi', nameAr: 'كريم الإدريسي', phone: '0612345678', subjectIdx: [0, 1] }],
  });
  const win = live.win;
  await gotoTeachers(win, L);
  await assertListMounted(win, L);

  await openDetail(win, /Karim Idrissi/);
  // All four detail tabs present.
  for (const name of Object.values(L.detail.tabs)) {
    await expect(win.getByRole('tab', { name })).toBeVisible();
  }
  await win.getByRole('tab', { name: L.detail.tabs.subjects }).click();
  const panel = win.getByRole('tabpanel', { name: L.detail.tabs.subjects });
  await expect(panel.getByText(subjectName(locale(), MATH), { exact: false })).toBeVisible();
  await expect(panel.getByText(subjectName(locale(), PHYS), { exact: false })).toBeVisible();
  await win.screenshot({ path: `test-results/teacher-detail-subjects-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 5 — edit a teacher's subjects (remove one, add another); the detail
// Subjects tab reflects the change. Maps to acceptance criterion #3 (edit).
// ---------------------------------------------------------------------------
test('Scenario 5 — edit a teacher\'s subjects via the multi-select', async () => {
  const L = STR[locale()];
  live = await boot(locale(), {
    subjects: [MATH, PHYS, SVT],
    teachers: [{ nameFr: 'Karim Idrissi', nameAr: 'كريم الإدريسي', phone: '0612345678', subjectIdx: [0] }], // Math only
  });
  const win = live.win;
  await gotoTeachers(win, L);
  await assertListMounted(win, L);

  const row = win.getByRole('row', { name: /Karim Idrissi/ });
  await row.getByRole('button', { name: L.row.menu }).click();
  await win.getByRole('menuitem', { name: L.row.edit }).click();

  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // Math is pre-checked (assigned); uncheck it and add Physique + SVT.
  const math = dialog.getByRole('checkbox', { name: subjectName(locale(), MATH), exact: true });
  await expect(math).toBeChecked();
  await math.click();
  await dialog.getByRole('checkbox', { name: subjectName(locale(), PHYS), exact: true }).click();
  await dialog.getByRole('checkbox', { name: subjectName(locale(), SVT), exact: true }).click();
  await dialog.getByRole('button', { name: L.form.save }).click();
  await expect(win.getByText(L.form.editSuccess)).toBeVisible();

  await openDetail(win, /Karim Idrissi/);
  await win.getByRole('tab', { name: L.detail.tabs.subjects }).click();
  const panel = win.getByRole('tabpanel', { name: L.detail.tabs.subjects });
  await expect(panel.getByText(subjectName(locale(), PHYS), { exact: false })).toBeVisible();
  await expect(panel.getByText(subjectName(locale(), SVT), { exact: false })).toBeVisible();
  await expect(panel.getByText(subjectName(locale(), MATH), { exact: true })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Scenario 6 — a teacher with no subjects shows the Subjects tab empty state.
// Empty-state coverage for acceptance criterion #2.
// ---------------------------------------------------------------------------
test('Scenario 6 — detail Subjects tab empty state for a teacher with no subjects', async () => {
  const L = STR[locale()];
  live = await boot(locale(), {
    subjects: [MATH],
    teachers: [{ nameFr: 'Sofia Alami', nameAr: 'صوفيا العلمي', phone: '0698765432' }], // no subjects
  });
  const win = live.win;
  await gotoTeachers(win, L);
  await assertListMounted(win, L);

  await openDetail(win, /Sofia Alami/);
  await win.getByRole('tab', { name: L.detail.tabs.subjects }).click();
  await expect(win.getByText(L.detail.subjectsEmptyTitle)).toBeVisible();
  await expect(win.getByText(L.detail.subjectsEmptyBody)).toBeVisible();
  await win.screenshot({ path: `test-results/teacher-detail-subjects-empty-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 7 — with no subjects configured, the create form's multi-select
// shows the "no subjects configured" guidance instead of an empty control.
// Empty-state coverage for acceptance criterion #3.
// ---------------------------------------------------------------------------
test('Scenario 7 — create form shows the empty-subjects guidance when none configured', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { subjects: [] });
  const win = live.win;
  await gotoTeachers(win, L);
  await assertListMounted(win, L);

  await win.getByRole('button', { name: L.newBtn }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(L.form.subjectsEmpty)).toBeVisible();
  await win.screenshot({ path: `test-results/teacher-form-subjects-empty-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 8 — locale direction + RTL mirroring on the teacher list, fully
// offline. The subject filter and header mirror with the text direction.
// ---------------------------------------------------------------------------
test('Scenario 8 — locale direction and RTL mirroring', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { subjects: [MATH, PHYS] });
  const win = live.win;
  await gotoTeachers(win, L);
  await assertListMounted(win, L);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[locale()]);
  expect(await win.evaluate(() => document.documentElement.lang)).toBe(locale());

  const heading = win.getByRole('heading', { level: 1, name: L.title });
  const newBtn = win.getByRole('button', { name: L.newBtn });
  const hBox = (await heading.boundingBox())!;
  const bBox = (await newBtn.boundingBox())!;
  if (locale() === 'ar') {
    expect(bBox.x, 'RTL: primary action sits left of the title').toBeLessThan(hBox.x);
  } else {
    expect(bBox.x, 'LTR: primary action sits right of the title').toBeGreaterThan(hBox.x);
  }

  // The subject filter is reachable and localized in this direction too.
  await expect(win.getByRole('combobox', { name: L.filters.subjectLabel })).toContainText(L.filters.subjectAll);
  await win.screenshot({ path: `test-results/teacher-direction-${locale()}.png` });
});
