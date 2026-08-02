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
 * Critical-only per SOU-142: kept scenario proves persistence across an app
 * relaunch — genuine cross-process E2E territory. Row rendering, day-closed
 * toggling, validation, and RTL mirroring are lower-risk and covered at the
 * unit/component level.
 *
 * Scope: the settings screen only. The out-of-hours session-rejection rule
 * ships as a pure domain policy under SOU-29 but the scheduling module it
 * guards is SOU-55, so session creation/rejection is intentionally NOT tested
 * here (deferred to SOU-55).
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

/**
 * Open the Paramètres screen and wait for the hours editor to be interactive
 * (past any load skeleton). SOU-99 moved the editor off the old smoke home into
 * the sidebar shell, so we navigate through the Paramètres nav entry first.
 * SOU-31 tabified Settings (Profile / Hours / Holidays / Password / Language /
 * Plan); Center Profile is the default tab, so we now switch to the Hours tab
 * explicitly (Horaires / المواعيد) before the editor is reachable.
 */
async function waitForHoursForm(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.settingsNav }).click();
  const hoursTabName = L.dir === 'rtl' ? 'المواعيد' : 'Horaires';
  await win.getByRole('tab', { name: hoursTabName }).click();
  await expect(win.getByRole('button', { name: L.save })).toBeVisible();
  await expect(win.getByRole('switch', { name: L.toggleAria(L.weekdays[0]!) })).toBeVisible();
}

// ---------------------------------------------------------------------------

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
