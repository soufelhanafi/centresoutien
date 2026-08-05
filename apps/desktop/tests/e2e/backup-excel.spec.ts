import { test, expect } from '@playwright/test';
import {
  XLS,
  freshBackupDir,
  freshUserDataDir,
  gotoBackupTab,
  isRealXlsx,
  launch,
  seedOneStudent,
  stubOpenDialog,
  stubSaveDialog,
  workbookPath,
  xlsxSize,
  type Launched,
  type Locale,
} from './backup-excel.fixtures';
import { completeSetupAndLogin } from './center-profile.fixtures';

/**
 * SOU-44 — Excel backup/restore card in Settings, black-box.
 *
 * Acceptance criteria:
 *  1. A center exports ALL entity types to an Excel workbook (one sheet per
 *     entity, full envelope) via a Save-As dialog; the card lives in Settings
 *     and the export button exports.
 *  2. A center imports a workbook: a preview dry-run shows created / updated /
 *     duplicate / invalid counts + a per-row table, then a confirm applies
 *     atomically.
 *  3. Export/import are gated on Pro+ (`io.excel.export` / `io.excel.import`);
 *     on Essentiel the card is locked.
 *
 * Critical happy path only, per e2e-testing skill. Runs under both the `fr`
 * (LTR) and `ar` (RTL) Playwright projects.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

test('Scenario 1 — export a full backup, then import the same file: preview shows counts + per-row table, confirm applies', async () => {
  test.setTimeout(90_000);
  const loc = locale();
  const t = XLS[loc];
  const backupDir = freshBackupDir();
  const target = workbookPath(backupDir, 'centre-backup.xlsx');

  live = await launch({ locale: loc, plan: 'pro', userDataDir: freshUserDataDir() });
  const { app, win } = live;
  await completeSetupAndLogin(win, loc);
  await seedOneStudent(win);

  const panel = await gotoBackupTab(win, loc);

  // --- Export via the native Save-As dialog (stubbed to a known path). ---
  await stubSaveDialog(app, target);
  await panel.getByRole('button', { name: t.exportButton, exact: true }).click();

  await expect(win.getByText(t.exportSuccess)).toBeVisible();
  await expect(isRealXlsx(target)).toBe(true);
  expect(xlsxSize(target)).toBeGreaterThan(1000);
  await win.screenshot({ path: `test-results/backup-excel-export-success-${loc}.png` });

  // --- Import the same workbook: dry-run preview, then apply. ---
  await stubOpenDialog(app, target);
  await panel.getByRole('button', { name: t.importButton, exact: true }).click();

  // Preview dry-run: the four count labels + the per-row table structure.
  await expect(win.getByText(t.countCreated)).toBeVisible();
  await expect(win.getByText(t.countUpdated)).toBeVisible();
  await expect(win.getByText(t.countDuplicate)).toBeVisible();
  await expect(win.getByText(t.countInvalid)).toBeVisible();
  await expect(win.getByRole('columnheader', { name: t.colSheet })).toBeVisible();
  await expect(win.getByRole('columnheader', { name: t.colRow })).toBeVisible();
  await expect(win.getByRole('columnheader', { name: t.colStatus })).toBeVisible();
  await expect(win.getByRole('columnheader', { name: t.colReason })).toBeVisible();
  await win.screenshot({ path: `test-results/backup-excel-import-preview-${loc}.png` });

  // Apply -> confirm dialog -> success summary.
  const apply = win.getByRole('button', { name: t.applyButton });
  await expect(apply).toBeEnabled();
  await apply.click();
  await win.getByRole('dialog').waitFor({ state: 'visible' });
  await win.getByRole('dialog').getByRole('button', { name: t.confirmApply, exact: true }).click();

  await expect(win.getByText(t.applySuccessPrefix)).toBeVisible();
  await win.screenshot({ path: `test-results/backup-excel-import-applied-${loc}.png` });
});

test('Scenario 2 — on Essentiel the Excel backup card is locked (no export/import action)', async () => {
  test.setTimeout(90_000);
  const loc = locale();
  const t = XLS[loc];

  live = await launch({ locale: loc, plan: 'essentiel', userDataDir: freshUserDataDir() });
  const { win } = live;
  await completeSetupAndLogin(win, loc);

  const panel = await gotoBackupTab(win, loc);

  await expect(win.getByText(t.excelTitle)).toBeVisible();
  await expect(win.getByText(t.locked)).toBeVisible();

  const exportBtn = panel.getByRole('button', { name: t.exportButton, exact: true });
  const importBtn = panel.getByRole('button', { name: t.importButton, exact: true });
  const exportCount = await exportBtn.count();
  const importCount = await importBtn.count();
  if (exportCount > 0) await expect(exportBtn).toBeDisabled();
  if (importCount > 0) await expect(importBtn).toBeDisabled();
  await win.screenshot({ path: `test-results/backup-excel-essentiel-locked-${loc}.png` });
});
