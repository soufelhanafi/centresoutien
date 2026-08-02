import { test, expect, type Page } from '@playwright/test';
import { STR, DIRECTION, boot, gotoPlanning, readWeek, pageCrashed, type Launched, type Locale } from './planning-sessions.fixtures';

/**
 * SOU-131 — AC1 (create renders in the grid without a DB seed) + AC3 (create →
 * grid in both FR-LTR and AR-RTL) + the agreed sanity behaviors: teacher and
 * group are optional (a session with neither saves and renders), and the form is
 * defaults-only (no validity-window / active-paused controls). Runs under both
 * the `fr` and `ar` Playwright projects.
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

// ---------------------------------------------------------------------------
// Sanity — teacher + group are OPTIONAL. This is the same happy path above with
// neither assigned, asserted explicitly through the persisted read model.
// (Assigning a teacher/group is exercised in the conflict + edit specs.)
// ---------------------------------------------------------------------------
test('a session with neither teacher nor group still saves and renders', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { rooms: [{ name: 'Salle Unique' }] });
  const win = live.win;
  await gotoPlanning(win, L);

  const dialog = await openCreate(win, L);
  await pickRoom(win, dialog, L, 'Salle Unique');
  await win.getByLabel(L.form.start, { exact: false }).fill('11:00');
  await win.getByLabel(L.form.end, { exact: false }).fill('12:00');
  // The defaults for teacher ("Sans enseignant") and group ("Sans groupe") are left as-is.
  await dialog.getByRole('button', { name: L.form.create }).click();

  await expect(win.getByText(L.form.createSuccess)).toBeVisible();
  await expect(win.getByText('Salle Unique')).toBeVisible();
  const wk = await readWeek(win);
  expect(wk).toHaveLength(1);
  expect(wk[0]).toMatchObject({ teacherId: null, groupId: null });
});

// ---------------------------------------------------------------------------
// Sanity — the create form is DEFAULTS-ONLY: no validity-window date pickers and
// no active/paused toggle. Only day / start / end / room / teacher / group.
// ---------------------------------------------------------------------------
test('the create form has no validity-window or active/paused controls', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { rooms: [{ name: 'Salle A' }] });
  const win = live.win;
  await gotoPlanning(win, L);
  const dialog = await openCreate(win, L);

  // No date inputs (validity window) and no switch/checkbox (active/paused).
  await expect(dialog.locator('input[type="date"]')).toHaveCount(0);
  await expect(dialog.getByRole('switch')).toHaveCount(0);
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);

  // Exactly the expected editable controls are present.
  await expect(dialog.getByRole('combobox', { name: L.form.day })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: L.form.room })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: L.form.teacher })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: L.form.group })).toBeVisible();
  await expect(win.getByLabel(L.form.start, { exact: false })).toBeVisible();
  await expect(win.getByLabel(L.form.end, { exact: false })).toBeVisible();
});
