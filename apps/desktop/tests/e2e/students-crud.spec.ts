import { test, expect, type Page } from '@playwright/test';
import { STR, DIRECTION, boot, gotoStudents, pageCrashed, type Launched, type Locale } from './students.fixtures';

/**
 * SOU-39 — Student CRUD UI + detail page. Black-box, driven only through the
 * running packaged app. Every spec runs under both the `fr` (LTR) and `ar` (RTL)
 * Playwright projects.
 *
 * Acceptance criteria under test:
 *   - Student list with search by name and level (group filter is a stub).
 *   - Detail page with 5 tabs (Info wired; Guardians/Enrollment/Invoices/
 *     Attendance are intentional stubs — verify placeholder shells only).
 *   - Admin can create / edit / archive students.
 *   - FR + AR/RTL, validation error paths, empty & no-result states.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

type NewStudent = { nameFr: string; nameAr: string; birthDate: string; level: string; school?: string; notes?: string };

/** Open the create dialog from the list, fill it, and submit. */
async function createStudent(win: Page, L: (typeof STR)[Locale], s: NewStudent): Promise<void> {
  await win.getByRole('button', { name: L.newBtn }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(L.form.nameFr, { exact: false }).fill(s.nameFr);
  await dialog.getByLabel(L.form.nameAr, { exact: false }).fill(s.nameAr);
  await dialog.getByLabel(L.form.birthDate, { exact: false }).fill(s.birthDate);
  await dialog.getByLabel(L.form.level, { exact: false }).fill(s.level);
  if (s.school) await dialog.getByLabel(L.form.school, { exact: false }).fill(s.school);
  if (s.notes) await dialog.getByLabel(L.form.notes, { exact: false }).fill(s.notes);
  await dialog.getByRole('button', { name: L.form.create }).click();
  // Toasts stack when several students are created in a row; assert the newest.
  await expect(win.getByText(L.form.createSuccess).first()).toBeVisible();
  await expect(dialog).toBeHidden();
}

/** Assert the list page mounted without hitting the renderer error boundary. */
async function assertListMounted(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  expect(await pageCrashed(win), 'Students page rendered without the "Something went wrong" error boundary').toBe(false);
  await expect(win.getByRole('heading', { level: 1, name: L.title })).toBeVisible();
}

// ---------------------------------------------------------------------------
// Scenario 1 — the list page renders (heading, subtitle, new button, search,
// level filter). This is the precondition for every other scenario.
// ---------------------------------------------------------------------------
test('Scenario 1 — Students list renders with header, search and level filter', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoStudents(win, L);
  await win.screenshot({ path: `test-results/students-list-${locale()}.png` });

  await assertListMounted(win, L);
  await expect(win.getByText(L.subtitle)).toBeVisible();
  await expect(win.getByRole('button', { name: L.newBtn })).toBeVisible();
  await expect(win.getByLabel(L.searchLabel, { exact: false }).or(win.getByPlaceholder(L.search))).toBeVisible();
  // The level filter is a combobox labelled via aria-label (its visible text is
  // the "all levels" option), so assert by accessible role+name, not by text.
  await expect(win.getByRole('combobox', { name: L.levelLabel })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 2 — empty state on a fresh center (no students yet).
// ---------------------------------------------------------------------------
test('Scenario 2 — empty state shows when there are no students', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoStudents(win, L);
  await assertListMounted(win, L);

  await expect(win.getByText(L.empty.title)).toBeVisible();
  await expect(win.getByText(L.empty.body)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 3 — create a student (FR+AR name, birth date, level, school, notes),
// success toast, and the new row appears in the list.
// ---------------------------------------------------------------------------
test('Scenario 3 — create a student and see it in the list', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoStudents(win, L);
  await assertListMounted(win, L);

  await createStudent(win, L, {
    nameFr: 'Yassine Alaoui',
    nameAr: 'ياسين العلوي',
    birthDate: '2010-05-14',
    level: '3AC',
    school: 'Collège Ibn Sina',
    notes: 'Élève sérieux',
  });
  await win.screenshot({ path: `test-results/students-created-${locale()}.png` });

  const row = win.getByRole('row', { name: /Yassine Alaoui/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText('3AC');
});

// ---------------------------------------------------------------------------
// Scenario 4 — validation: empty required fields and an invalid calendar date.
// ---------------------------------------------------------------------------
test('Scenario 4 — form rejects empty required fields and an invalid date', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoStudents(win, L);
  await assertListMounted(win, L);

  await win.getByRole('button', { name: L.newBtn }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Submit fully empty. The three text fields are required; the empty
  // birth-date field (a native date input, which cannot hold a fake calendar
  // date) is rejected by the domain schema as an invalid date.
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expect(dialog.getByText(L.errors.required).first()).toBeVisible();
  await expect(dialog.getByText(L.errors.invalidDate)).toBeVisible();
  // Still open — submission was blocked.
  await expect(dialog).toBeVisible();
  await win.screenshot({ path: `test-results/students-validation-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 5 — search by name filters the list; a non-match shows no-results.
// ---------------------------------------------------------------------------
test('Scenario 5 — search by name filters the list', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoStudents(win, L);
  await assertListMounted(win, L);

  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });
  await createStudent(win, L, { nameFr: 'Salma Bennani', nameAr: 'سلمى البناني', birthDate: '2011-09-02', level: '2AC' });

  const search = win.getByLabel(L.searchLabel, { exact: false }).or(win.getByPlaceholder(L.search)).first();
  await search.fill('Salma');
  await expect(win.getByRole('row', { name: /Salma Bennani/ })).toBeVisible();
  await expect(win.getByRole('row', { name: /Yassine Alaoui/ })).toHaveCount(0);

  await search.fill('Zzz-nobody');
  await expect(win.getByText(L.noResults.title)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 6 — filter by level narrows the list to the chosen grade.
// ---------------------------------------------------------------------------
test('Scenario 6 — filter by level', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoStudents(win, L);
  await assertListMounted(win, L);

  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });
  await createStudent(win, L, { nameFr: 'Salma Bennani', nameAr: 'سلمى البناني', birthDate: '2011-09-02', level: '2AC' });

  // Choose the "3AC" level in the level filter (combobox or native select).
  const levelFilter = win.getByLabel(L.levelLabel, { exact: false }).first();
  await levelFilter.click();
  await win.getByRole('option', { name: '3AC', exact: true }).click();

  await expect(win.getByRole('row', { name: /Yassine Alaoui/ })).toBeVisible();
  await expect(win.getByRole('row', { name: /Salma Bennani/ })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Scenario 7 — edit a student; the list reflects the change.
// ---------------------------------------------------------------------------
test('Scenario 7 — edit a student', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoStudents(win, L);
  await assertListMounted(win, L);

  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });

  const row = win.getByRole('row', { name: /Yassine Alaoui/ });
  await row.getByRole('button', { name: L.row.menu }).click();
  await win.getByRole('menuitem', { name: L.row.edit }).click();

  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(L.form.level, { exact: false }).fill('2 Bac SM');
  await dialog.getByRole('button', { name: L.form.save }).click();
  await expect(win.getByText(L.form.editSuccess)).toBeVisible();

  await expect(win.getByRole('row', { name: /Yassine Alaoui/ })).toContainText('2 Bac SM');
});

// ---------------------------------------------------------------------------
// Scenario 8 — archive a student; confirm dialog, then the row leaves the
// active list.
// ---------------------------------------------------------------------------
test('Scenario 8 — archive a student', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoStudents(win, L);
  await assertListMounted(win, L);

  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });

  const row = win.getByRole('row', { name: /Yassine Alaoui/ });
  await row.getByRole('button', { name: L.row.menu }).click();
  await win.getByRole('menuitem', { name: L.row.archive }).click();

  const confirm = win.getByRole('alertdialog').or(win.getByRole('dialog'));
  await expect(confirm.getByText(L.archive.title)).toBeVisible();
  const confirmBtn = confirm.getByRole('button', { name: L.archive.confirm });
  await expect(confirmBtn).toBeVisible();

  // The confirmation button must sit inside the viewport so the user can click
  // it. (In RTL the AlertDialog is pinned to the left edge and its buttons
  // overflow off-screen — this assertion catches that regression crisply.)
  const box = (await confirmBtn.boundingBox())!;
  const vw = await win.evaluate(() => window.innerWidth);
  expect(box.x, 'archive confirm button is within the viewport (not off-screen)').toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw);

  await confirmBtn.click();
  await expect(win.getByText(L.archive.success)).toBeVisible();
  await expect(win.getByRole('row', { name: /Yassine Alaoui/ })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Scenario 9 — detail page: 5 tabs; Info shows real data; the four stub tabs
// render coming-soon placeholders (per the agreed SOU-39 scope).
// ---------------------------------------------------------------------------
test('Scenario 9 — detail page shows 5 tabs; Info + Guardians wired, rest are stubs', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoStudents(win, L);
  await assertListMounted(win, L);

  await createStudent(win, L, {
    nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC', school: 'Collège Ibn Sina',
  });
  // The row's open affordance is the student-name link to the detail route.
  await win.getByRole('row', { name: /Yassine Alaoui/ }).getByRole('link', { name: /Yassine Alaoui/ }).click();

  // 5 tabs present.
  for (const name of Object.values(L.detail.tabs)) {
    await expect(win.getByRole('tab', { name })).toBeVisible();
  }
  // Info tab (default) shows the real values. Scope to the Info tabpanel so we
  // assert the wired data, not the page-header heading which repeats the name.
  await expect(win.getByRole('heading', { name: 'Yassine Alaoui' })).toBeVisible();
  const info = win.getByRole('tabpanel', { name: L.detail.tabs.info });
  await expect(info.getByText('Yassine Alaoui')).toBeVisible();
  await expect(info.getByText('ياسين العلوي')).toBeVisible();
  await expect(info.getByText('3AC')).toBeVisible();
  await expect(info.getByText('Collège Ibn Sina')).toBeVisible();
  await win.screenshot({ path: `test-results/students-detail-info-${locale()}.png` });

  // Stub tabs → placeholder shells (no real data expected).
  await win.getByRole('tab', { name: L.detail.tabs.enrollment }).click();
  await expect(win.getByText(L.comingSoon.enrollment)).toBeVisible();
  await win.getByRole('tab', { name: L.detail.tabs.invoices }).click();
  await expect(win.getByText(L.comingSoon.invoices)).toBeVisible();
  await win.getByRole('tab', { name: L.detail.tabs.attendance }).click();
  await expect(win.getByText(L.comingSoon.attendance)).toBeVisible();
  // Guardians is a live linking surface (SOU-42), no longer a stub: the tab
  // exposes the "link a guardian" action.
  await win.getByRole('tab', { name: L.detail.tabs.guardians }).click();
  await expect(win.getByRole('button', { name: L.detail.guardiansLink })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 10 — two students with the same name (different birth dates, i.e.
// legitimately distinct people) must both be created — never blocked as
// duplicates. (Guardian/parent linking is out of scope, SOU-42; birth date is
// the black-box proxy for "different fathers".)
// ---------------------------------------------------------------------------
test('Scenario 10 — same name, distinct people are both kept (not flagged duplicate)', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoStudents(win, L);
  await assertListMounted(win, L);

  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2010-05-14', level: '3AC' });
  await createStudent(win, L, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', birthDate: '2012-11-03', level: '1AC' });

  await expect(win.getByRole('row', { name: /Yassine Alaoui/ })).toHaveCount(2);
});

// ---------------------------------------------------------------------------
// Scenario 11 — locale direction: heading localized, dir attribute correct,
// and the list mirrors in RTL under the `ar` project. Fully offline (no
// network is ever used by the app).
// ---------------------------------------------------------------------------
test('Scenario 11 — locale direction and RTL mirroring', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoStudents(win, L);
  await assertListMounted(win, L);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[locale()]);
  expect(await win.evaluate(() => document.documentElement.lang)).toBe(locale());

  // Header + primary action mirror with the text direction.
  const heading = win.getByRole('heading', { level: 1, name: L.title });
  const newBtn = win.getByRole('button', { name: L.newBtn });
  const hBox = (await heading.boundingBox())!;
  const bBox = (await newBtn.boundingBox())!;
  if (locale() === 'ar') {
    // RTL → the primary action sits to the LEFT of the title.
    expect(bBox.x).toBeLessThan(hBox.x);
  } else {
    // LTR → the primary action sits to the RIGHT of the title.
    expect(bBox.x).toBeGreaterThan(hBox.x);
  }
  await win.screenshot({ path: `test-results/students-direction-${locale()}.png` });
});
