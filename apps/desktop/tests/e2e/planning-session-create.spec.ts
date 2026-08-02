import { test, expect, type Page } from '@playwright/test';
import { STR, DIRECTION, boot, gotoPlanning, readWeek, pageCrashed, type Launched, type Locale } from './planning-sessions.fixtures';

/**
 * SOU-131 — AC1 (create renders in the grid without a DB seed) + AC3 (create →
 * grid in both FR-LTR and AR-RTL). Runs under both the `fr` and `ar`
 * Playwright projects.
 *
 * Critical-only per SOU-142: this is the canonical top-level "schedule a
 * session" flow. Teacher/group-optional and defaults-only-form sanity checks
 * dropped here are lower-risk UI assertions — unit/component test the form
 * instead.
 */

const locale = () => test.info().project.name as Locale;

let live: (Launched & { seeded: unknown }) | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

async function openCreate(win: Page, L: (typeof STR)[Locale]) {
  await win.getByRole('button', { name: L.form.new }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

async function pickRoom(win: Page, dialog: ReturnType<Page['getByRole']>, L: (typeof STR)[Locale], name: string) {
  await dialog.getByRole('combobox', { name: L.form.room }).click();
  await win.getByRole('option', { name, exact: true }).click();
}

// ---------------------------------------------------------------------------
// AC1 + AC3 — a director adds a weekly session from the planner (room only, no
// teacher, no group) and it appears in the grid, with NO session seeded in the DB.
// ---------------------------------------------------------------------------
test('creates a weekly session from the planner and it renders in the grid (no DB seed)', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { rooms: [{ name: 'Salle A' }, { name: 'Salle B' }] });
  const win = live.win;

  // RTL / locale sanity for the AR project.
  await expect(win.locator('html')).toHaveAttribute('dir', DIRECTION[locale()]);

  await gotoPlanning(win, L);
  // Precondition: nothing seeded — the grid starts empty.
  await expect(win.getByText(L.emptyWeek)).toBeVisible();
  expect(await readWeek(win)).toHaveLength(0);

  const dialog = await openCreate(win, L);
  await pickRoom(win, dialog, L, 'Salle A');
  await win.getByLabel(L.form.start, { exact: false }).fill('09:30');
  await win.getByLabel(L.form.end, { exact: false }).fill('10:30');
  await dialog.getByRole('button', { name: L.form.create }).click();

  // Success feedback, drawer closes, grid is no longer empty.
  await expect(win.getByText(L.form.createSuccess)).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(win.getByText(L.emptyWeek)).toBeHidden();

  // Renders in the grid: the room name and the unassigned-subject label show in
  // the newly-created cell (room name is Latin data, identical in both locales).
  await expect(win.getByText('Salle A')).toBeVisible();
  await expect(win.getByText(L.unknownSubject)).toBeVisible();

  // Persistence proof at the public contract level — the write path really wrote,
  // no seed involved. Teacher and group are unassigned (optional fields).
  const wk = await readWeek(win);
  expect(wk).toHaveLength(1);
  expect(wk[0]).toMatchObject({ dayOfWeek: 1, start: '09:30', end: '10:30', teacherId: null, groupId: null });
  expect(await pageCrashed(win)).toBe(false);
});
