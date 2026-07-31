import { test, expect, type Page } from '@playwright/test';
import { STR, boot, gotoGroups, pageCrashed, type Launched, type Locale } from './groups.fixtures';

/**
 * SOU-50 — Group CRUD UI · DETAIL ROSTER + quick add-student.
 * Runs under both `fr` (LTR) and `ar` (RTL) projects.
 *
 * MOCK BOUNDARY: roster contents + fill live on the mock read model until
 * SOU-127. The detail page carries a visible "read-model provisoire" banner. We
 * verify the roster surface renders and that quick-add reflects in the roster;
 * we do NOT assert persistence to a real DB — PASS (mock boundary).
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

async function openMathDetail(win: Page, L: (typeof STR)[Locale]) {
  const row = win.getByRole('row', { name: /2 Bac SM/ }).first();
  await row.getByRole('button', { name: L.row.menu }).click();
  await win.getByRole('menuitem', { name: L.row.open }).click();
  await win.waitForTimeout(400);
}

test('Group detail renders roster, meta and the SOU-127 read-model notice', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoGroups(win, L);
  await openMathDetail(win, L);

  expect(await pageCrashed(win)).toBe(false);
  await expect(win.getByText(L.detail.back)).toBeVisible();
  await expect(win.getByText(L.roster.title).first()).toBeVisible();
  await expect(win.getByRole('button', { name: L.roster.add }).first()).toBeVisible();
  // Mock-boundary notice is surfaced to the user.
  await expect(win.getByText(L.roster.pending)).toBeVisible();
  await win.screenshot({ path: `test-results/groups-detail-${locale()}.png` });
});

test('Quick add-student updates the roster (mock boundary)', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoGroups(win, L);
  await openMathDetail(win, L);

  await win.getByRole('button', { name: L.roster.add }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Pick the first available candidate student from the (mock) list.
  await dialog.getByRole('combobox').first().click();
  const firstOption = win.getByRole('option').first();
  const picked = (await firstOption.innerText()).trim();
  await firstOption.click();
  await dialog.getByRole('button', { name: L.roster.addConfirm }).click();

  // Success feedback, dialog closes, and the roster reflects the new student.
  await expect(win.getByText(L.roster.addSuccess)).toBeVisible();
  await expect(dialog).toBeHidden();
  // The picked candidate's name (its student part) now appears in the roster.
  const name = picked.split('—')[0]!.trim();
  await expect(win.getByText(name).first()).toBeVisible();
  await win.screenshot({ path: `test-results/groups-roster-added-${locale()}.png` });
});
