import { test, expect, type Page } from '@playwright/test';
import { STR, boot, gotoPlanning, readWeek, type Launched, type Locale } from './planning-sessions.fixtures';

/**
 * SOU-131 — AC1 (edit and cancel a weekly recurring session from the planner and
 * see the grid update). Runs under both `fr` (LTR) and `ar` (RTL) projects.
 */

const locale = () => test.info().project.name as Locale;

let live: (Launched & { seeded: unknown }) | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

async function createSlot(win: Page, L: (typeof STR)[Locale], room: string, start: string, end: string) {
  await win.getByRole('button', { name: L.form.new }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox', { name: L.form.room }).click();
  await win.getByRole('option', { name: room, exact: true }).click();
  await win.getByLabel(L.form.start, { exact: false }).fill(start);
  await win.getByLabel(L.form.end, { exact: false }).fill(end);
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expect(win.getByText(L.form.createSuccess)).toBeVisible();
  await expect(dialog).toBeHidden();
}

// ---------------------------------------------------------------------------
// Edit — open an existing slot from the grid, change its end time, save; the grid
// (and the persisted read model) reflect the new time.
// ---------------------------------------------------------------------------
test('edits a session time and the grid reflects the change', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { rooms: [{ name: 'Salle A' }] });
  const win = live.win;
  await gotoPlanning(win, L);

  await createSlot(win, L, 'Salle A', '09:00', '10:00');
  expect((await readWeek(win))[0]).toMatchObject({ start: '09:00', end: '10:00' });

  // Open the edit drawer by clicking the session cell.
  await win.getByText('Salle A').click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: L.form.editTitle })).toBeVisible();

  await win.getByLabel(L.form.end, { exact: false }).fill('11:00');
  await dialog.getByRole('button', { name: L.form.save }).click();

  await expect(win.getByText(L.form.editSuccess)).toBeVisible();
  await expect(dialog).toBeHidden();

  const wk = await readWeek(win);
  expect(wk).toHaveLength(1);
  expect(wk[0]).toMatchObject({ start: '09:00', end: '11:00' });
});

// ---------------------------------------------------------------------------
// Cancel — open a slot, cancel it (with confirmation); it disappears from the
// grid and the read model is empty again.
// ---------------------------------------------------------------------------
test('cancels a session and it disappears from the grid', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { rooms: [{ name: 'Salle A' }] });
  const win = live.win;
  await gotoPlanning(win, L);

  await createSlot(win, L, 'Salle A', '14:00', '15:00');
  expect(await readWeek(win)).toHaveLength(1);

  await win.getByText('Salle A').click();
  const editDialog = win.getByRole('dialog');
  await expect(editDialog).toBeVisible();
  await editDialog.getByRole('button', { name: L.cancelSession.trigger, exact: true }).click();

  // Confirmation dialog — scoped by its title so we never hit the edit drawer's
  // own trigger button of the same name.
  const confirm = win.getByRole('dialog').filter({ hasText: L.cancelSession.title });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: L.cancelSession.confirm, exact: true }).click();

  await expect(win.getByText(L.cancelSession.success)).toBeVisible();
  await expect(win.getByText(L.emptyWeek)).toBeVisible();
  expect(await readWeek(win)).toHaveLength(0);
});
