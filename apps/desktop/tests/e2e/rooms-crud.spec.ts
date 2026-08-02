import { test, expect, type Page } from '@playwright/test';
import { STR, boot, gotoRooms, pageCrashed, type Launched, type Locale } from './rooms.fixtures';

/**
 * SOU-33 + SOU-34 — Rooms data layer + IPC (SOU-33) and Rooms CRUD UI (SOU-34).
 * Black-box, driven only through the running packaged app over the REAL
 * SQLite-backed `room.*` IPC gateway. Runs under both the `fr` (LTR) and `ar`
 * (RTL) Playwright projects.
 *
 * Critical-only per SOU-142: rooms are low business risk (no money, no
 * security, no hard domain invariant), so a single create happy path stands
 * in for the whole CRUD surface. Validation, edit, archive/restore, empty
 * states, and RTL are lower blast-radius — unit/component test the form and
 * table instead.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

/** Open the create dialog from the list, fill it, and submit. */
async function createRoom(win: Page, L: (typeof STR)[Locale], name: string, capacity: string): Promise<void> {
  await win.getByRole('button', { name: L.newBtn }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(L.form.name, { exact: false }).fill(name);
  await dialog.getByLabel(L.form.capacity, { exact: false }).fill(capacity);
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expect(win.getByText(L.form.createSuccess).first()).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(win.getByRole('row', { name: new RegExp(name) })).toBeVisible();
}

/** Assert the list page mounted without hitting the renderer error boundary. */
async function assertListMounted(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  expect(await pageCrashed(win), 'Rooms page rendered without the "Something went wrong" error boundary').toBe(false);
  await expect(win.getByRole('heading', { level: 1, name: L.title })).toBeVisible();
}

// ---------------------------------------------------------------------------
// Scenario 2 — create a room (capacity ≥ 1); success toast and the new row
// appears with its capacity.
// ---------------------------------------------------------------------------
test('Scenario 2 — create a room and see it in the active list', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoRooms(win, L);
  await assertListMounted(win, L);

  await createRoom(win, L, 'Salle Informatique', '24');
  await win.screenshot({ path: `test-results/rooms-created-${locale()}.png` });

  const row = win.getByRole('row', { name: /Salle Informatique/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText('24');
});
