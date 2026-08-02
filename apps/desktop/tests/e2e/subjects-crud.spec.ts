import { test, expect, type Page } from '@playwright/test';
import { STR, boot, gotoSubjects, rowMenuLabel, pageCrashed, subjectName, type Launched, type Locale, type CreatedSubject } from './subjects.fixtures';

/**
 * SOU-47 — Subjects (Matières) CRUD UI. Black-box, driven only through the
 * running packaged app. Runs under both the `fr` (LTR) and `ar` (RTL)
 * Playwright projects.
 *
 * Critical-only per SOU-142: kept scenarios are create (the canonical
 * top-level flow) and the delete-blocked-when-in-use guard — this is the
 * explicit CLAUDE.md hard invariant (`SubjectInUseError`: a subject
 * referenced by any active Formula or Group cannot be deleted, only
 * deactivated). List rendering, empty states, validation, duplicate-code,
 * rename, deactivate/reactivate, delete-when-unused, and nav/RTL are lower
 * blast-radius and better covered at the unit/component level.
 */

const locale = () => test.info().project.name as Locale;

let live: (Launched & { subjects: CreatedSubject[] }) | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

const MATH = { nameFr: 'Mathématiques', nameAr: 'الرياضيات', code: 'MATH' };

async function assertMounted(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  expect(await pageCrashed(win), 'Subjects page rendered without the error boundary').toBe(false);
  await expect(win.getByRole('heading', { level: 1, name: L.title })).toBeVisible();
}

function shot(name: string): string {
  // Per-test output dir so screenshots land with the run's artifacts on CI and
  // any machine — never a hardcoded absolute path.
  return test.info().outputPath(`sou47-${name}-${test.info().project.name}.png`);
}

test('AC2 create — code auto-uppercased, row appears, success toast', async () => {
  const loc = locale();
  const L = STR[loc];
  live = await boot(loc, { subjects: [] });
  await gotoSubjects(live.win, L);
  await assertMounted(live.win, L);

  await live.win.getByRole('button', { name: L.newBtn }).first().click();
  const dialog = live.win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(L.form.nameFr, { exact: false }).fill('Chimie');
  await dialog.getByLabel(L.form.nameAr, { exact: false }).fill('الكيمياء');
  await dialog.getByLabel(L.form.code, { exact: false }).fill('chim'); // lowercase
  await dialog.getByRole('button', { name: L.form.create }).click();

  await expect(live.win.getByText(L.form.createSuccess)).toBeVisible();
  const row = live.win.getByRole('row', { name: /Chimie/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText('CHIM'); // auto-uppercased
});

test('AC5 delete when IN USE — blocked modal names the referencing group', async () => {
  const loc = locale();
  const L = STR[loc];
  const GROUP_LEVEL = '3ème A Bac';
  live = await boot(loc, { subjects: [MATH], groups: [{ subjectIdx: 0, level: GROUP_LEVEL }] });
  await gotoSubjects(live.win, L);
  await assertMounted(live.win, L);

  const name = subjectName(loc, MATH);
  const row = live.win.getByRole('row', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  // In-use count reflects the one live group (locale-formatted "1").
  const oneFormatted = new Intl.NumberFormat(loc).format(1);
  await expect(row).toContainText(oneFormatted);

  // Open the menu and click Delete → blocked modal.
  await live.win.getByRole('button', { name: rowMenuLabel(L, name) }).click();
  const deleteItem = live.win.getByRole('menuitem', { name: L.row.delete });
  await expect(deleteItem).toBeVisible();
  // NOTE: the item is intentionally NOT natively-disabled (design: keep the
  // tooltip + informative modal reachable). Record its disabled state.
  const nativelyDisabled = await deleteItem.isDisabled();
  test.info().annotations.push({ type: 'delete-item-nativelyDisabled', description: String(nativelyDisabled) });

  await deleteItem.click();
  const dialog = live.win.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: L.delete.blockedTitle })).toBeVisible();
  // The named reference: kind label + the group's level (NOT just a count).
  await expect(dialog.getByText(L.referenceKind.group, { exact: false })).toBeVisible();
  await expect(dialog.getByText(GROUP_LEVEL, { exact: false })).toBeVisible();
  // Deactivate offered as the alternative.
  await expect(dialog.getByRole('button', { name: L.delete.deactivateInstead })).toBeVisible();

  await live.win.screenshot({ path: shot('delete-blocked') });
});
