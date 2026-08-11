import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  addWindowButton,
  freshUserDataDir,
  launch,
  passFirstRun,
  windowCloseInput,
  windowOpenInput,
  type Launched,
  type Locale,
} from './center-hours.fixtures';

/**
 * SOU-197 — the mid-day break on the weekly planner. Black-box: driven only
 * through the running app + public preload bridge. Runs under both the `fr`
 * (LTR) and `ar` (RTL) Playwright projects.
 *
 * Scope: the planner surface only — that the break renders as a hatched closed
 * gap on the grid and that a session spanning the break is rejected with a
 * clear, translated error. (Editor + validation + persistence are covered in
 * `settings-center-hours.spec.ts` / `center-hours-settings.spec.ts`.)
 */

const locale = () => test.info().project.name as Locale;

const HOURS_TAB: Record<Locale, string> = { fr: 'Horaires', ar: 'المواعيد' };

type Bridge = { invoke: (channel: string, req: unknown) => Promise<unknown> };

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

/** Boot, seed a room, and save Monday as 09:00–12:00 + 14:00–18:00. */
async function setupTwoWindowMonday(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.evaluate(async () => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('room.create', { name: 'Salle A', capacity: 20 });
  });
  await win.getByRole('link', { name: L.settingsNav }).click();
  await win.getByRole('tab', { name: HOURS_TAB[locale()] }).click();
  await win.getByRole('button', { name: L.save }).waitFor();
  await windowOpenInput(win, 1, 0).fill('09:00');
  await windowCloseInput(win, 1, 0).fill('12:00');
  await addWindowButton(win, 1, L.addWindow).click();
  await windowOpenInput(win, 1, 1).fill('14:00');
  await windowCloseInput(win, 1, 1).fill('18:00');
  await win.getByRole('button', { name: L.save }).click();
  await expect(win.getByText(L.saved)).toBeVisible();
}

async function gotoPlanner(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  await win.getByRole('link', { name: L.navPlanning, exact: true }).click();
  await win.getByRole('heading', { name: L.plannerTitle }).waitFor();
}

/**
 * The mid-day break renders as a closed gap on the grid: a muted overlay
 * carrying the repeating-hatch pattern (decorative, no accessible name — the
 * style signature is the only observable surface; same as SOU-165's gap check).
 */
function breakGapOverlay(win: Page) {
  return win.locator('main div[aria-hidden="true"][style*="var(--muted)"][style*="repeating-linear-gradient"]');
}

test('Scenario 8 — the mid-day break renders as a hatched closed gap on the grid', async () => {
  const L = STR[locale()];
  live = await launch(locale(), freshUserDataDir());
  await passFirstRun(live.win);
  const win = live.win;

  await setupTwoWindowMonday(win, L);
  await gotoPlanner(win, L);

  // Exactly one gap overlay: the Monday 12:00–14:00 break (every other day is a
  // single 09:00–18:00 window). The axis runs through the break.
  await expect(breakGapOverlay(win)).toHaveCount(1);
  await expect(win.getByText('12:00', { exact: true })).toBeVisible();
  await expect(win.getByText('14:00', { exact: true })).toBeVisible();

  await win.screenshot({ path: `test-results/sou197-planner-break-gap-${locale()}.png` });
});

test('Scenario 9 — a session spanning the mid-day break is rejected with a translated error', async () => {
  const L = STR[locale()];
  live = await launch(locale(), freshUserDataDir());
  await passFirstRun(live.win);
  const win = live.win;

  await setupTwoWindowMonday(win, L);
  await gotoPlanner(win, L);

  // Monday (the dialog's default day) 11:00–12:30: starts in the morning window
  // and ends in the break → must be rejected.
  await win.getByRole('button', { name: L.newSession }).click();
  const dlg = win.getByRole('dialog', { name: L.newSession });
  await dlg.waitFor();
  await dlg.locator('input[name="start"]').fill('11:00');
  await dlg.locator('input[name="end"]').fill('12:30');
  await dlg.getByRole('combobox', { name: L.roomLabel }).click();
  await win.getByRole('option', { name: 'Salle A' }).click();
  await dlg.getByRole('button', { name: L.createSession }).click();

  // Clear, translated rejection — the session is NOT created.
  await expect(win.getByText(L.errOutsideHours)).toBeVisible();
  const week = (await win.evaluate(async () => {
    const api = (window as unknown as { api: Bridge }).api;
    return api.invoke('session.week', {});
  })) as { sessions: unknown[] };
  expect(week.sessions).toHaveLength(0);

  await win.screenshot({ path: `test-results/sou197-session-across-break-${locale()}.png` });
});
