import { test, expect, type Page } from '@playwright/test';
import { STR, boot, gotoStudents, pageCrashed, type Launched, type Locale } from './students.fixtures';

/**
 * SOU-39 — Student CRUD UI + detail page. Black-box, driven only through the
 * running packaged app. Runs under both the `fr` (LTR) and `ar` (RTL)
 * Playwright projects.
 *
 * Critical-only per SOU-142: kept scenarios are create (the canonical
 * top-level flow), archive (soft-delete invariant — no hard deletes ever),
 * and same-name-distinct-people-both-kept (the explicit CLAUDE.md dedup rule:
 * students match on normalized name + parentId, so two "Yassine Alaoui"
 * never collide unless they share a father — a hard data-integrity
 * invariant). List rendering, empty state, validation, search/filter, edit,
 * detail-tab wiring, and RTL are lower blast-radius and better covered at
 * the unit/component level.
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
