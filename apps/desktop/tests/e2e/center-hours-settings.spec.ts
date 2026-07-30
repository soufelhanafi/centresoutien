import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  adminExists,
  closeInput,
  freshUserDataDir,
  launch,
  openInput,
  passFirstRun,
  type Launched,
  type Locale,
} from './center-hours.fixtures';

/**
 * SOU-29 — Opening hours per weekday (Settings CRUD), black-box.
 *
 * Scope: the settings screen only. The out-of-hours session-rejection rule
 * ships as a pure domain policy under SOU-29 but the scheduling module it
 * guards is SOU-55, so session creation/rejection is intentionally NOT tested
 * here (deferred to SOU-55). Each spec runs under both the `fr` and `ar`
 * Playwright projects, giving LTR + RTL coverage.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

/** Wait for the hours editor to be interactive (past any load skeleton). */
async function waitForHoursForm(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await expect(win.getByRole('button', { name: L.save })).toBeVisible();
  await expect(win.getByRole('switch', { name: L.toggleAria(L.weekdays[0]!) })).toBeVisible();
}

// ---------------------------------------------------------------------------

test('Scenario 1 — seven weekday rows render, Sunday..Saturday, all open by default', async () => {
  const L = STR[locale()];
  live = await launch(locale(), freshUserDataDir());
  await passFirstRun(live.win);
  const win = live.win;
  await waitForHoursForm(win, L);

  await expect(win.getByText(L.title).first()).toBeVisible();

  // Exactly 7 toggles + 7 open + 7 close inputs.
  await expect(win.getByRole('switch')).toHaveCount(7);

  for (let d = 0; d < 7; d++) {
    const day = L.weekdays[d]!;
    await expect(win.getByRole('switch', { name: L.toggleAria(day) })).toBeVisible();
    // Default = open 09:00–18:00, editable.
    await expect(openInput(win, d)).toHaveValue('09:00');
    await expect(closeInput(win, d)).toHaveValue('18:00');
  }

  await win.screenshot({ path: `test-results/hours-rows-${locale()}.png` });
});

test('Scenario 2 — set open/close, save, relaunch the app → values persist', async () => {
  const L = STR[locale()];
  const dir = freshUserDataDir();

  live = await launch(locale(), dir);
  await passFirstRun(live.win);
  let win = live.win;
  await waitForHoursForm(win, L);

  // Change Monday (index 1) to 08:30–17:15 and save.
  await openInput(win, 1).fill('08:30');
  await closeInput(win, 1).fill('17:15');
  await win.getByRole('button', { name: L.save }).click();
  await expect(win.getByText(L.saved)).toBeVisible();
  await live.app.close();

  // Relaunch the SAME userData dir → app home (not the wizard), values kept.
  live = await launch(locale(), dir);
  win = live.win;
  await expect.poll(() => adminExists(win)).toBe(true);
  await waitForHoursForm(win, L);
  await expect(openInput(win, 1)).toHaveValue('08:30');
  await expect(closeInput(win, 1)).toHaveValue('17:15');
});

test('Scenario 3 — toggling a day closed clears its time inputs; save + relaunch persists closed', async () => {
  const L = STR[locale()];
  const dir = freshUserDataDir();

  live = await launch(locale(), dir);
  await passFirstRun(live.win);
  let win = live.win;
  await waitForHoursForm(win, L);

  // Close Sunday (index 0).
  const sunday = win.getByRole('switch', { name: L.toggleAria(L.weekdays[0]!) });
  await sunday.click();
  await expect(sunday).toHaveAttribute('aria-checked', 'false');
  // Its time inputs are removed (cleared) from the DOM.
  await expect(openInput(win, 0)).toHaveCount(0);
  await expect(closeInput(win, 0)).toHaveCount(0);
  // The row now reads "closed".
  await expect(win.getByText(L.closed).first()).toBeVisible();

  await win.getByRole('button', { name: L.save }).click();
  await expect(win.getByText(L.saved)).toBeVisible();
  await live.app.close();

  // Relaunch → Sunday still closed, no time inputs.
  live = await launch(locale(), dir);
  win = live.win;
  await waitForHoursForm(win, L);
  await expect(win.getByRole('switch', { name: L.toggleAria(L.weekdays[0]!) })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(openInput(win, 0)).toHaveCount(0);
  await expect(closeInput(win, 0)).toHaveCount(0);
  // A still-open day keeps its inputs.
  await expect(openInput(win, 1)).toHaveValue('09:00');
});

test('Scenario 4a — close earlier than open is rejected with a localized error, not saved', async () => {
  const L = STR[locale()];
  const dir = freshUserDataDir();

  live = await launch(locale(), dir);
  await passFirstRun(live.win);
  let win = live.win;
  await waitForHoursForm(win, L);

  // Overnight / inverted times on Monday: close before open.
  await openInput(win, 1).fill('18:00');
  await closeInput(win, 1).fill('09:00');
  await win.getByRole('button', { name: L.save }).click();

  // Localized error shown; no success confirmation.
  await expect(win.getByText(L.errCloseBeforeOpen)).toBeVisible();
  await expect(win.getByText(L.saved)).toHaveCount(0);
  await win.screenshot({ path: `test-results/hours-error-close-before-open-${locale()}.png` });
  await live.app.close();

  // Relaunch → the invalid edit was not persisted (defaults intact).
  live = await launch(locale(), dir);
  win = live.win;
  await waitForHoursForm(win, L);
  await expect(openInput(win, 1)).toHaveValue('09:00');
  await expect(closeInput(win, 1)).toHaveValue('18:00');
});

test('Scenario 4b — an empty/invalid time on an open day is rejected with a localized error', async () => {
  const L = STR[locale()];
  live = await launch(locale(), freshUserDataDir());
  await passFirstRun(live.win);
  const win = live.win;
  await waitForHoursForm(win, L);

  // Clear Tuesday's opening time while the day stays open.
  await openInput(win, 2).fill('');
  await win.getByRole('button', { name: L.save }).click();

  await expect(win.getByText(L.errInvalidTime)).toBeVisible();
  await expect(win.getByText(L.saved)).toHaveCount(0);
});

test('Scenario 5 — RTL/LTR: direction matches the locale and copy is localized', async () => {
  const L = STR[locale()];
  live = await launch(locale(), freshUserDataDir());
  await passFirstRun(live.win);
  const win = live.win;
  await waitForHoursForm(win, L);

  // <html dir> mirrors the locale (rtl for ar, ltr for fr).
  expect(await win.evaluate(() => document.documentElement.dir)).toBe(L.dir);
  expect(await win.evaluate(() => document.documentElement.lang)).toBe(locale());

  // Weekday labels + toggle aria are in the active language, Sunday-first.
  for (let d = 0; d < 7; d++) {
    await expect(win.getByRole('switch', { name: L.toggleAria(L.weekdays[d]!) })).toBeVisible();
  }

  // The localized validation error renders in the active language too.
  await openInput(win, 1).fill('18:00');
  await closeInput(win, 1).fill('09:00');
  await win.getByRole('button', { name: L.save }).click();
  await expect(win.getByText(L.errCloseBeforeOpen)).toBeVisible();
  await win.screenshot({ path: `test-results/hours-direction-${locale()}.png` });
});
