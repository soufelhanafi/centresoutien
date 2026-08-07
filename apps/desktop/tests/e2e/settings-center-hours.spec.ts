import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  closeInput,
  freshUserDataDir,
  launch,
  openInput,
  passFirstRun,
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
