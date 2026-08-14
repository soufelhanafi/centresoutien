import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  STR,
  boot,
  goto,
  pageCrashed,
  type Launched,
  type Locale,
} from './student-teacher-parent-form-dialog.fixtures';

/**
 * SOU-249 — student/teacher/parent add-edit forms open as a CENTERED dialog
 * modal (not a right-side Sheet drawer). Black-box: asserts only what the user
 * sees — the `[role="dialog"]` with `data-state="open"`, that its bounding box
 * is horizontally centered inside the viewport (not pinned to either edge),
 * that the title + description render, and that the form is fillable and
 * submittable. Runs under both the `fr` (LTR) and `ar` (RTL) projects.
 *
 * The existing CRUD suites (students-crud, parents-crud, teacher-subjects)
 * already assert open→fill→submit→row-appears end to end; this spec focuses
 * narrowly on the dialog-vs-sheet nature of the change.
 */

const locale = () => test.info().project.name as Locale;
const MATH = { nameFr: 'Mathématiques', nameAr: 'الرياضيات', code: 'MATH' };
const subjectName = (l: Locale) => (l === 'ar' ? MATH.nameAr : MATH.nameFr);

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

/** Open the page's add form and assert it is a visible open dialog. */
async function openAddDialog(win: Page, addButtonLabel: string): Promise<Locator> {
  await win.getByRole('button', { name: addButtonLabel, exact: true }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('data-state', 'open');
  return dialog;
}

/**
 * The modal must be centered inside the viewport, not a right-side drawer:
 *   - fully inside the viewport (not pushed off-screen),
 *   - its horizontal center near the viewport center,
 *   - its left edge well clear of both viewport edges (a 480px drawer on a
 *     1280px window would sit at x ≈ 800, failing the < 50% vw check).
 */
async function expectCenteredDialog(win: Page, dialog: Locator): Promise<void> {
  const box = (await dialog.boundingBox())!;
  const vw = await win.evaluate(() => window.innerWidth);
  const vh = await win.evaluate(() => window.innerHeight);
  expect(box.x, 'dialog left edge inside viewport').toBeGreaterThanOrEqual(0);
  expect(box.y, 'dialog top edge inside viewport').toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, 'dialog right edge inside viewport').toBeLessThanOrEqual(vw);
  expect(box.y + box.height, 'dialog bottom edge inside viewport').toBeLessThanOrEqual(vh);
  expect(Math.abs(box.x + box.width / 2 - vw / 2), 'dialog horizontally centered').toBeLessThan(vw * 0.1);
  expect(box.x, 'dialog not pinned to the right edge (not a right-side drawer)').toBeLessThan(vw * 0.5);
  expect(Math.abs(box.y + box.height / 2 - vh / 2), 'dialog vertically centered').toBeLessThan(vh * 0.2);
}

test('student add form opens as a centered dialog, is fillable and submittable', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await goto(win, L.nav.students);
  expect(await pageCrashed(win), 'Students page rendered without the error boundary').toBe(false);

  const dialog = await openAddDialog(win, L.newBtn.students);
  await expectCenteredDialog(win, dialog);
  await expect(dialog.getByRole('heading', { name: L.students.createTitle })).toBeVisible();
  await expect(dialog.getByText(L.students.createDescription)).toBeVisible();

  await dialog.getByLabel(L.students.nameFr, { exact: false }).fill('Sara Benali');
  await dialog.getByLabel(L.students.nameAr, { exact: false }).fill('سارة بنعلي');
  await dialog.getByLabel(L.students.birthDate, { exact: false }).fill('2011-03-22');
  await dialog.getByLabel(L.students.level, { exact: false }).fill('2AC');
  await dialog.getByRole('button', { name: L.students.create }).click();
  await expect(win.getByText(L.students.createSuccess).first()).toBeVisible();
  await expect(dialog).toBeHidden();
});

test('teacher add form opens as a centered dialog, is fillable and submittable', async () => {
  const L = STR[locale()];
  live = await boot(locale(), [MATH]);
  const win = live.win;
  await goto(win, L.nav.teachers);
  expect(await pageCrashed(win), 'Teachers page rendered without the error boundary').toBe(false);

  const dialog = await openAddDialog(win, L.newBtn.teachers);
  await expectCenteredDialog(win, dialog);
  await expect(dialog.getByRole('heading', { name: L.teachers.createTitle })).toBeVisible();
  await expect(dialog.getByText(L.teachers.createDescription)).toBeVisible();

  await dialog.getByLabel(L.teachers.nameFr, { exact: false }).fill('Amine Bénani');
  await dialog.getByLabel(L.teachers.nameAr, { exact: false }).fill('أمين بناني');
  await dialog.getByLabel(L.teachers.phone, { exact: false }).first().fill('0623456789');
  await dialog.getByRole('checkbox', { name: subjectName(locale()), exact: true }).click();
  await dialog.getByRole('button', { name: L.teachers.create }).click();
  await expect(win.getByText(L.teachers.createSuccess).first()).toBeVisible();
  await expect(dialog).toBeHidden();
});

test('parent add form opens as a centered dialog, is fillable and submittable', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await goto(win, L.nav.parents);
  expect(await pageCrashed(win), 'Parents page rendered without the error boundary').toBe(false);

  const dialog = await openAddDialog(win, L.newBtn.parents);
  await expectCenteredDialog(win, dialog);
  await expect(dialog.getByRole('heading', { name: L.parents.createTitle })).toBeVisible();
  await expect(dialog.getByText(L.parents.createDescription)).toBeVisible();

  await dialog.getByLabel(L.parents.name, { exact: false }).fill('Hassan Benali');
  await dialog.getByLabel(L.parents.phone, { exact: false }).fill('0661234567');
  await dialog.getByRole('combobox', { name: L.parents.relation }).click();
  await win.getByRole('option', { name: L.parents.relationPere, exact: true }).click();
  await dialog.getByRole('button', { name: L.parents.create }).click();
  await expect(win.getByText(L.parents.createSuccess).first()).toBeVisible();
  await expect(dialog).toBeHidden();
});
