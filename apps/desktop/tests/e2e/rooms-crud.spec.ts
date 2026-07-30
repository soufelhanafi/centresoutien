import { test, expect, type Page } from '@playwright/test';
import { STR, DIRECTION, boot, gotoRooms, pageCrashed, type Launched, type Locale } from './rooms.fixtures';

/**
 * SOU-34 — Rooms CRUD UI (list / form / archive / restore). Black-box, driven
 * only through the running packaged app. Every spec runs under both the `fr`
 * (LTR) and `ar` (RTL) Playwright projects.
 *
 * Acceptance criteria under test:
 *   - Rooms list/table with name, capacity, session count ("—" placeholder),
 *     lifecycle state, row actions.
 *   - Admin can create / edit / archive / restore rooms.
 *   - Archived rooms leave the active list (the forward-looking "absent from
 *     scheduling pickers" acceptance — pickers are Epic 6).
 *   - FR + AR/RTL, validation error paths, empty & archived-empty states.
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
}

/** Assert the list page mounted without hitting the renderer error boundary. */
async function assertListMounted(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  expect(await pageCrashed(win), 'Rooms page rendered without the "Something went wrong" error boundary').toBe(false);
  await expect(win.getByRole('heading', { level: 1, name: L.title })).toBeVisible();
}

// ---------------------------------------------------------------------------
// Scenario 1 — the list page renders (heading, subtitle, new button, tabs, and
// the seeded rooms). Precondition for every other scenario.
// ---------------------------------------------------------------------------
test('Scenario 1 — Rooms list renders with header, tabs and seeded rooms', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoRooms(win, L);
  await win.screenshot({ path: `test-results/rooms-list-${locale()}.png` });

  await assertListMounted(win, L);
  await expect(win.getByText(L.subtitle)).toBeVisible();
  await expect(win.getByRole('button', { name: L.newBtn })).toBeVisible();
  await expect(win.getByRole('tab', { name: L.tabs.active })).toBeVisible();
  await expect(win.getByRole('tab', { name: L.tabs.archived })).toBeVisible();
  await expect(win.getByRole('row', { name: /Salle 1/ })).toBeVisible();
  await expect(win.getByRole('row', { name: /Salle 2/ })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 2 — create a room; success toast and the new row appears with its
// capacity.
// ---------------------------------------------------------------------------
test('Scenario 2 — create a room and see it in the list', async () => {
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
// Scenario 4 — edit a room; the list reflects the new capacity.
// ---------------------------------------------------------------------------
test('Scenario 4 — edit a room', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await gotoRooms(win, L);
  await assertListMounted(win, L);

  const row = win.getByRole('row', { name: /Salle 1/ });
  await row.getByRole('button', { name: L.row.menu }).click();
  await win.getByRole('menuitem', { name: L.row.edit }).click();

  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(L.form.capacity, { exact: false }).fill('30');
  await dialog.getByRole('button', { name: L.form.save }).click();
  await expect(win.getByText(L.form.editSuccess)).toBeVisible();

  await expect(win.getByRole('row', { name: /Salle 1/ })).toContainText('30');
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

  const row = win.getByRole('row', { name: /Salle 2/ });
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

  // Gone from the active list.
  await expect(win.getByRole('row', { name: /Salle 2/ })).toHaveCount(0);

  // Present in the archived tab, with a restore action.
  await win.getByRole('tab', { name: L.tabs.archived }).click();
  const archivedRow = win.getByRole('row', { name: /Salle 2/ });
  await expect(archivedRow).toBeVisible();
  await win.screenshot({ path: `test-results/rooms-archived-${locale()}.png` });
  await archivedRow.getByRole('button', { name: L.row.restore }).click();
  await expect(win.getByText(L.restore.success)).toBeVisible();

  // Back in the active list.
  await win.getByRole('tab', { name: L.tabs.active }).click();
  await expect(win.getByRole('row', { name: /Salle 2/ })).toBeVisible();
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
  const newBtn = win.getByRole('button', { name: L.newBtn });
  const hBox = (await heading.boundingBox())!;
  const bBox = (await newBtn.boundingBox())!;
  if (locale() === 'ar') {
    expect(bBox.x).toBeLessThan(hBox.x);
  } else {
    expect(bBox.x).toBeGreaterThan(hBox.x);
  }
  await win.screenshot({ path: `test-results/rooms-direction-${locale()}.png` });
});
