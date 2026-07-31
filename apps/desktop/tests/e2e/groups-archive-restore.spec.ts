import { test, expect } from '@playwright/test';
import { STR, boot, gotoGroups, type Launched, type Locale } from './groups.fixtures';

/**
 * SOU-50 — Group CRUD UI · ARCHIVE / RESTORE (soft delete lifecycle).
 * Runs under both `fr` (LTR) and `ar` (RTL) projects. Mock-backed but the full
 * lifecycle is exercised within the session.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

test('Archive a group then restore it', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoGroups(win, L);

  // Physique-Chimie — unique subject in the active list. (Level "1 Bac SE" is NOT
  // unique: the mock also seeds an archived Français group at that level.)
  const row = win.getByRole('row', { name: /Physique-Chimie/ });
  await row.getByRole('button', { name: L.row.menu }).click();
  await win.getByRole('menuitem', { name: L.row.archive }).click();

  const confirm = win.getByRole('alertdialog').or(win.getByRole('dialog'));
  await expect(confirm.getByText(L.archiveConfirm.title)).toBeVisible();
  const confirmBtn = confirm.getByRole('button', { name: L.archiveConfirm.confirm });
  // Confirm button stays within the viewport in both LTR and RTL.
  const box = (await confirmBtn.boundingBox())!;
  const vw = await win.evaluate(() => window.innerWidth);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw);
  await confirmBtn.click();

  await expect(win.getByText(L.archiveConfirm.success)).toBeVisible();
  // Left the active list; another active group remains.
  await expect(win.getByRole('row', { name: /Physique-Chimie/ })).toHaveCount(0);
  await expect(win.getByRole('row', { name: /3AC/ })).toBeVisible();

  // Present in the archived tab, restorable.
  await win.getByRole('tab', { name: L.tabs.archived }).click();
  const archivedRow = win.getByRole('row', { name: /Physique-Chimie/ });
  await expect(archivedRow).toBeVisible();
  await win.screenshot({ path: `test-results/groups-archived-${locale()}.png` });
  await archivedRow.getByRole('button', { name: L.row.restore }).click();
  await expect(win.getByText(L.restoreSuccess)).toBeVisible();

  // Back in the active list.
  await win.getByRole('tab', { name: L.tabs.active }).click();
  await expect(win.getByRole('row', { name: /Physique-Chimie/ })).toBeVisible();
});
