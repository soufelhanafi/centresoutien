import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  addWindowButton,
  closeInput,
  freshUserDataDir,
  launch,
  openInput,
  passFirstRun,
  removeWindowButton,
  windowCloseInput,
  windowOpenInput,
  type Launched,
  type Locale,
} from './center-hours.fixtures';

/**
 * SOU-174 — Center Hours settings component aligns with the design system.
 *
 * Black-box. Everything is driven through the running app and the public
 * preload bridge — no renderer/domain implementation is imported.
 *
 * Acceptance intent (visual/structure parity with sibling settings
 * components): the component lives in Settings inside a Card wrapper, renders
 * one row per weekday with an open/closed toggle + labeled open/close time
 * inputs, saves with a success toast, and persists. Errors surface visibly.
 *
 * Runs under both the `fr` (LTR) and `ar` (RTL) Playwright projects.
 */

const locale = () => test.info().project.name as Locale;

const HOURS_TAB: Record<Locale, string> = { fr: 'Horaires', ar: 'المواعيد' };

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

/** Boot a fresh app and land on the Settings → Hours tab, form interactive. */
async function gotoHoursForm(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.settingsNav }).click();
  await win.getByRole('tab', { name: HOURS_TAB[locale()] }).click();
  await expect(win.getByRole('button', { name: L.save })).toBeVisible();
  await expect(win.getByRole('switch', { name: L.toggleAria(L.weekdays[0]!) })).toBeVisible();
}

// ---------------------------------------------------------------------------
// Scenario 1 — the screen renders in Settings with the sibling component
// structure: a Card wrapper containing the title and description, and the save
// button. In AR the document direction is `rtl` (mirrored layout). Per-weekday
// row detail (toggle, labels, inputs) is exercised at the component level
// (`center-hours-form.test.tsx`) — the E2E stays on the cross-layer surface.
// ---------------------------------------------------------------------------
test('Scenario 1 — renders in Settings with Card wrapper and RTL direction', async () => {
  const L = STR[locale()];
  const dir = freshUserDataDir();

  live = await launch(locale(), dir);
  await passFirstRun(live.win);
  const win = live.win;
  await gotoHoursForm(win, L);

  // AR renders the app right-to-left.
  const htmlDir = await win.evaluate(() => document.documentElement.getAttribute('dir'));
  expect(htmlDir).toBe(L.dir);

  // Card wrapper: the hours content sits inside the Card visual container.
  const card = win.getByTestId('center-hours-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText(L.title);
  await expect(card).toContainText(L.description);
  await expect(win.getByRole('button', { name: L.save })).toBeVisible();

  await win.screenshot({ path: `test-results/center-hours-render-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 2 — edit weekday times + close a day, save → success toast, values
// survive navigating away to the dashboard and back (real data round-trip).
// (Full relaunch persistence is already covered by the existing
// `center-hours-settings.spec.ts`.)
// ---------------------------------------------------------------------------
test('Scenario 2 — save shows success toast and values persist across navigation', async () => {
  const L = STR[locale()];
  const dir = freshUserDataDir();

  live = await launch(locale(), dir);
  await passFirstRun(live.win);
  const win = live.win;
  await gotoHoursForm(win, L);

  // Monday 08:30–17:15; close Sunday.
  await openInput(win, 1).fill('08:30');
  await closeInput(win, 1).fill('17:15');
  const sunday = win.getByRole('switch', { name: L.toggleAria(L.weekdays[0]!) });
  if ((await sunday.getAttribute('aria-checked')) === 'true') {
    await sunday.click();
  }
  await win.getByRole('button', { name: L.save }).click();

  // Success toast is visible.
  await expect(win.getByText(L.saved)).toBeVisible();

  // Navigate away to the dashboard (unmounts the form) and back → values kept.
  await win.getByRole('link', { name: L.dashboardNav }).click();
  await expect(win.getByRole('heading', { level: 1, name: L.dashboardNav })).toBeVisible();
  await gotoHoursForm(win, L);
  await expect(openInput(win, 1)).toHaveValue('08:30');
  await expect(closeInput(win, 1)).toHaveValue('17:15');
  expect(await win.getByRole('switch', { name: L.toggleAria(L.weekdays[0]!) }).getAttribute('aria-checked')).toBe('false');
  await expect(openInput(win, 0)).toHaveCount(0); // closed day keeps no time inputs

  await win.screenshot({ path: `test-results/center-hours-persist-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 3 — error path: close-before-open. Save is rejected with a visible
// validation error and NO success toast (nothing silently accepted).
// ---------------------------------------------------------------------------
test('Scenario 3 — invalid hours (close before open) rejected with visible error', async () => {
  const L = STR[locale()];
  const dir = freshUserDataDir();

  live = await launch(locale(), dir);
  await passFirstRun(live.win);
  const win = live.win;
  await gotoHoursForm(win, L);

  await openInput(win, 1).fill('18:00');
  await closeInput(win, 1).fill('08:00');
  await win.getByRole('button', { name: L.save }).click();

  await expect(win.getByText(L.errCloseBeforeOpen)).toBeVisible();
  await expect(win.getByText(L.saved)).toHaveCount(0);

  await win.screenshot({ path: `test-results/center-hours-error-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 4 (SOU-197) — a weekday holds TWO open windows (mid-day break).
// Add a second window to Monday (09:00–12:00 + 14:00–18:00), save, and confirm
// both windows persist after navigating away and back.
// ---------------------------------------------------------------------------
test('Scenario 4 — a weekday can hold two windows and they persist', async () => {
  const L = STR[locale()];
  const dir = freshUserDataDir();

  live = await launch(locale(), dir);
  await passFirstRun(live.win);
  const win = live.win;
  await gotoHoursForm(win, L);

  // RTL acceptance: in AR the whole document (and thus the editor) is `rtl`.
  const htmlDir = await win.evaluate(() => document.documentElement.getAttribute('dir'));
  expect(htmlDir).toBe(L.dir);

  await windowOpenInput(win, 1, 0).fill('09:00');
  await windowCloseInput(win, 1, 0).fill('12:00');
  await addWindowButton(win, 1, L.addWindow).click();
  await expect(windowOpenInput(win, 1, 1)).toBeVisible();
  await windowOpenInput(win, 1, 1).fill('14:00');
  await windowCloseInput(win, 1, 1).fill('18:00');
  await win.getByRole('button', { name: L.save }).click();
  await expect(win.getByText(L.saved)).toBeVisible();

  await win.getByRole('link', { name: L.dashboardNav }).click();
  await expect(win.getByRole('heading', { level: 1, name: L.dashboardNav })).toBeVisible();
  await gotoHoursForm(win, L);
  await expect(windowOpenInput(win, 1, 0)).toHaveValue('09:00');
  await expect(windowCloseInput(win, 1, 0)).toHaveValue('12:00');
  await expect(windowOpenInput(win, 1, 1)).toHaveValue('14:00');
  await expect(windowCloseInput(win, 1, 1)).toHaveValue('18:00');

  await win.screenshot({ path: `test-results/center-hours-two-windows-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 5 (SOU-197) — remove windows. Removing every window of a weekday
// leaves it CLOSED (toggle off, no time inputs), and that closed state persists.
// ---------------------------------------------------------------------------
test('Scenario 5 — removing all windows leaves the day closed', async () => {
  const L = STR[locale()];
  const dir = freshUserDataDir();

  live = await launch(locale(), dir);
  await passFirstRun(live.win);
  const win = live.win;
  await gotoHoursForm(win, L);

  await windowOpenInput(win, 1, 0).fill('09:00');
  await windowCloseInput(win, 1, 0).fill('12:00');
  await addWindowButton(win, 1, L.addWindow).click();
  await windowOpenInput(win, 1, 1).fill('14:00');
  await windowCloseInput(win, 1, 1).fill('18:00');

  // Remove the second window, then the first — the day must become closed.
  await removeWindowButton(win, 1, 1, L.removeWindow).click();
  await expect(windowOpenInput(win, 1, 1)).toHaveCount(0);
  await removeWindowButton(win, 1, 0, L.removeWindow).click();
  const mondaySwitch = win.getByRole('switch', { name: L.toggleAria(L.weekdays[1]!) });
  await expect(mondaySwitch).toHaveAttribute('aria-checked', 'false');
  await expect(windowOpenInput(win, 1, 0)).toHaveCount(0);

  await win.getByRole('button', { name: L.save }).click();
  await expect(win.getByText(L.saved)).toBeVisible();

  await win.getByRole('link', { name: L.dashboardNav }).click();
  await expect(win.getByRole('heading', { level: 1, name: L.dashboardNav })).toBeVisible();
  await gotoHoursForm(win, L);
  await expect(mondaySwitch).toHaveAttribute('aria-checked', 'false');
  await expect(windowOpenInput(win, 1, 0)).toHaveCount(0);

  await win.screenshot({ path: `test-results/center-hours-closed-day-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 6 (SOU-197) — overlapping windows are rejected with a clear,
// translated error and nothing is saved.
// ---------------------------------------------------------------------------
test('Scenario 6 — overlapping windows are rejected with a clear error', async () => {
  const L = STR[locale()];
  const dir = freshUserDataDir();

  live = await launch(locale(), dir);
  await passFirstRun(live.win);
  const win = live.win;
  await gotoHoursForm(win, L);

  await windowOpenInput(win, 1, 0).fill('09:00');
  await windowCloseInput(win, 1, 0).fill('12:00');
  await addWindowButton(win, 1, L.addWindow).click();
  await windowOpenInput(win, 1, 1).fill('11:00'); // overlaps 09:00–12:00
  await windowCloseInput(win, 1, 1).fill('14:00');
  await win.getByRole('button', { name: L.save }).click();

  await expect(win.getByText(L.errWindowsOverlap)).toBeVisible();
  await expect(win.getByText(L.saved)).toHaveCount(0);

  // Nothing was persisted: navigating away and back shows a single window.
  await win.getByRole('link', { name: L.dashboardNav }).click();
  await expect(win.getByRole('heading', { level: 1, name: L.dashboardNav })).toBeVisible();
  await gotoHoursForm(win, L);
  await expect(windowOpenInput(win, 1, 0)).toHaveValue('09:00');
  await expect(windowOpenInput(win, 1, 1)).toHaveCount(0);

  await win.screenshot({ path: `test-results/center-hours-overlap-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 7 (SOU-197) — an added window whose close ≤ open is rejected with a
// clear, translated error (same guard as the base window, now on window N).
// ---------------------------------------------------------------------------
test('Scenario 7 — added window with close before open is rejected', async () => {
  const L = STR[locale()];
  const dir = freshUserDataDir();

  live = await launch(locale(), dir);
  await passFirstRun(live.win);
  const win = live.win;
  await gotoHoursForm(win, L);

  await windowOpenInput(win, 1, 0).fill('09:00');
  await windowCloseInput(win, 1, 0).fill('12:00');
  await addWindowButton(win, 1, L.addWindow).click();
  await windowOpenInput(win, 1, 1).fill('14:00');
  await windowCloseInput(win, 1, 1).fill('12:00'); // close before open
  await win.getByRole('button', { name: L.save }).click();

  await expect(win.getByText(L.errCloseBeforeOpen)).toBeVisible();
  await expect(win.getByText(L.saved)).toHaveCount(0);

  await win.screenshot({ path: `test-results/center-hours-window-close-before-open-${locale()}.png` });
});
