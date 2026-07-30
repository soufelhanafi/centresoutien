import { test, expect, type Page } from '@playwright/test';
import { STR, DIRECTION, boot, gotoRooms, pageCrashed, type Launched, type Locale } from './rooms.fixtures';

/**
 * SOU-33 + SOU-34 — Rooms data layer + IPC (SOU-33) and Rooms CRUD UI (SOU-34).
 * Black-box, driven only through the running packaged app over the REAL
 * SQLite-backed `room.*` IPC gateway. Every spec runs under both the `fr` (LTR)
 * and `ar` (RTL) Playwright projects.
 *
 * A fresh E2E database starts with NO rooms, so each scenario creates the data
 * it needs through the UI.
 *
 * Acceptance criteria under test:
 *   - Admin can CREATE a room (name + capacity ≥ 1).
 *   - capacity < 1 is rejected with a validation error.
 *   - Admin can EDIT a room's name/capacity.
 *   - Admin can ARCHIVE an active room; it leaves the active list and appears in
 *     the archived view.
 *   - Admin can RESTORE an archived room; it returns to the active list.
 *   - The active list excludes archived rooms.
 *   - FR (LTR) + AR (RTL), plus empty & archived-empty states.
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
// Scenario 1 — the list page renders (heading, subtitle, new button, tabs) and,
// on a fresh SQLite database, shows the active empty state. Precondition for
// every other scenario.
// ---------------------------------------------------------------------------
test('Scenario 1 — Rooms list renders header, tabs and an empty active list', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoRooms(win, L);
  await win.screenshot({ path: `test-results/rooms-list-${locale()}.png` });

  await assertListMounted(win, L);
  await expect(win.getByText(L.subtitle)).toBeVisible();
  await expect(win.getByRole('button', { name: L.newBtn }).first()).toBeVisible();
  await expect(win.getByRole('tab', { name: L.tabs.active })).toBeVisible();
  await expect(win.getByRole('tab', { name: L.tabs.archived })).toBeVisible();
  // Fresh DB → no rooms → active empty state.
  await expect(win.getByText(L.empty.title)).toBeVisible();
});

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

// ---------------------------------------------------------------------------
// Scenario 3 — validation: empty name and empty (non-integer) capacity are
// rejected and the dialog stays open.
// ---------------------------------------------------------------------------
test('Scenario 3 — form rejects an empty name and a missing capacity', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoRooms(win, L);
  await assertListMounted(win, L);

  await win.getByRole('button', { name: L.newBtn }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: L.form.create }).click();
  await expect(dialog.getByText(L.errors.required)).toBeVisible();
  await expect(dialog.getByText(L.errors.notInteger)).toBeVisible();
  await expect(dialog).toBeVisible();
  await win.screenshot({ path: `test-results/rooms-validation-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 3b — validation: capacity < 1 (zero) is rejected with the dedicated
// "capacity must be at least 1" error; the room is not created.
// ---------------------------------------------------------------------------
test('Scenario 3b — capacity below 1 is rejected', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoRooms(win, L);
  await assertListMounted(win, L);

  await win.getByRole('button', { name: L.newBtn }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(L.form.name, { exact: false }).fill('Salle Zéro');
  await dialog.getByLabel(L.form.capacity, { exact: false }).fill('0');
  await dialog.getByRole('button', { name: L.form.create }).click();

  await expect(dialog.getByText(L.errors.capacityTooSmall)).toBeVisible();
  await expect(dialog).toBeVisible();
  await win.screenshot({ path: `test-results/rooms-capacity-too-small-${locale()}.png` });

  // Room must not have been created. Close the dialog (Escape; the footer
  // "Cancel" and the header close "X" share the same accessible name).
  await win.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(win.getByRole('row', { name: /Salle Zéro/ })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Scenario 4 — edit a room's name and capacity; the list reflects both.
// ---------------------------------------------------------------------------
test('Scenario 4 — edit a room name and capacity', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoRooms(win, L);
  await assertListMounted(win, L);

  await createRoom(win, L, 'Salle A', '10');

  const row = win.getByRole('row', { name: /Salle A/ });
  await row.getByRole('button', { name: L.row.menu }).click();
  await win.getByRole('menuitem', { name: L.row.edit }).click();

  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(L.form.name, { exact: false }).fill('Salle A2');
  await dialog.getByLabel(L.form.capacity, { exact: false }).fill('30');
  await dialog.getByRole('button', { name: L.form.save }).click();
  await expect(win.getByText(L.form.editSuccess)).toBeVisible();

  const edited = win.getByRole('row', { name: /Salle A2/ });
  await expect(edited).toBeVisible();
  await expect(edited).toContainText('30');
});

// ---------------------------------------------------------------------------
// Scenario 5 — archive a room (confirm dialog), it leaves the active list and
// appears in the archived tab; restore brings it back to the active list.
// ---------------------------------------------------------------------------
test('Scenario 5 — archive then restore a room', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoRooms(win, L);
  await assertListMounted(win, L);

  // Two rooms so the active list is non-empty after archiving one.
  await createRoom(win, L, 'Salle Alpha', '12');
  await createRoom(win, L, 'Salle Beta', '15');

  const row = win.getByRole('row', { name: /Salle Beta/ });
  await row.getByRole('button', { name: L.row.menu }).click();
  await win.getByRole('menuitem', { name: L.row.archive }).click();

  const confirm = win.getByRole('dialog');
  await expect(confirm.getByText(L.archive.title)).toBeVisible();
  const confirmBtn = confirm.getByRole('button', { name: L.archive.confirm });
  // The confirm button must sit inside the viewport in both LTR and RTL.
  const box = (await confirmBtn.boundingBox())!;
  const vw = await win.evaluate(() => window.innerWidth);
  expect(box.x, 'archive confirm button is within the viewport').toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw);
  await confirmBtn.click();
  await expect(win.getByText(L.archive.success)).toBeVisible();

  // Gone from the active list; the other room stays.
  await expect(win.getByRole('row', { name: /Salle Beta/ })).toHaveCount(0);
  await expect(win.getByRole('row', { name: /Salle Alpha/ })).toBeVisible();

  // Present in the archived tab, with a restore action.
  await win.getByRole('tab', { name: L.tabs.archived }).click();
  const archivedRow = win.getByRole('row', { name: /Salle Beta/ });
  await expect(archivedRow).toBeVisible();
  await win.screenshot({ path: `test-results/rooms-archived-${locale()}.png` });
  await archivedRow.getByRole('button', { name: L.row.restore }).click();
  await expect(win.getByText(L.restore.success)).toBeVisible();

  // Back in the active list.
  await win.getByRole('tab', { name: L.tabs.active }).click();
  await expect(win.getByRole('row', { name: /Salle Beta/ })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 6 — the archived tab shows its empty state before anything is
// archived.
// ---------------------------------------------------------------------------
test('Scenario 6 — archived tab shows an empty state initially', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoRooms(win, L);
  await assertListMounted(win, L);

  await win.getByRole('tab', { name: L.tabs.archived }).click();
  await expect(win.getByText(L.archivedEmpty.title)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 7 — locale direction: heading localized, dir attribute correct, and
// the header mirrors in RTL under the `ar` project.
// ---------------------------------------------------------------------------
test('Scenario 7 — locale direction and RTL mirroring', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoRooms(win, L);
  await assertListMounted(win, L);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[locale()]);
  expect(await win.evaluate(() => document.documentElement.lang)).toBe(locale());

  const heading = win.getByRole('heading', { level: 1, name: L.title });
  const newBtn = win.getByRole('button', { name: L.newBtn }).first();
  const hBox = (await heading.boundingBox())!;
  const bBox = (await newBtn.boundingBox())!;
  if (locale() === 'ar') {
    expect(bBox.x).toBeLessThan(hBox.x);
  } else {
    expect(bBox.x).toBeGreaterThan(hBox.x);
  }
  await win.screenshot({ path: `test-results/rooms-direction-${locale()}.png` });
});
