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

// Copy mirrored from the running UI (discovered via live-DOM inspection), per
// locale — labels on the time inputs and the Settings tab name.
const ROW_LABEL: Record<Locale, { open: string; close: string }> = {
  fr: { open: 'Ouverture', close: 'Fermeture' },
  ar: { open: 'الفتح', close: 'الإغلاق' },
};

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
// structure: a Card wrapper containing the title, the description, one
// open/closed toggle + open/close labeled time inputs per weekday, and the
// save button. Asserted by role/name; the Card container is the observable
// `bg-card` wrapper. In AR the document direction is `rtl` (mirrored layout).
// ---------------------------------------------------------------------------
test('Scenario 1 — renders in Settings with Card wrapper, labeled weekday rows, RTL direction', async () => {
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
  const tabpanel = win.getByRole('tabpanel').filter({ hasText: L.title });
  await expect(tabpanel).toBeVisible();
  const card = tabpanel.locator('[class*="bg-card"]');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText(L.title);
  await expect(card).toContainText(L.description);

  // One toggle + one labeled open/close pair per weekday.
  for (let day = 0; day < 7; day++) {
    const dayName = L.weekdays[day]!;
    await expect(win.getByRole('switch', { name: L.toggleAria(dayName) })).toBeVisible();
    await expect(openInput(win, day)).toBeVisible();
    await expect(closeInput(win, day)).toBeVisible();
  }
  await expect(tabpanel.getByText(ROW_LABEL[locale()].open, { exact: true })).toHaveCount(7);
  await expect(tabpanel.getByText(ROW_LABEL[locale()].close, { exact: true })).toHaveCount(7);

  // The toggle is usable: it flips and collapses the day's time inputs.
  const monday = win.getByRole('switch', { name: L.toggleAria(L.weekdays[1]!) });
  expect(await monday.getAttribute('aria-checked')).toBe('true');
  await monday.click();
  await expect(openInput(win, 1)).toHaveCount(0);
  await monday.click();
  await expect(openInput(win, 1)).toBeVisible();

  await win.screenshot({ path: `test-results/center-hours-render-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// Scenario 2 — edit weekday times + close a day, save → success toast, values
// survive navigating away/back AND a full page reload (real data round-trip).
// ---------------------------------------------------------------------------
test('Scenario 2 — save shows success toast and values persist across navigation and reload', async () => {
  const L = STR[locale()];
  const dir = freshUserDataDir();

  live = await launch(locale(), dir);
  await passFirstRun(live.win);
  let win = live.win;
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

  // Navigate away (dashboard) and back → values retained.
  await win.getByRole('link', { name: L.settingsNav }).click();
  await gotoHoursForm(win, L);
  await expect(openInput(win, 1)).toHaveValue('08:30');
  await expect(closeInput(win, 1)).toHaveValue('17:15');
  expect(await win.getByRole('switch', { name: L.toggleAria(L.weekdays[0]!) }).getAttribute('aria-checked')).toBe('false');

  // Full page reload → values still there (persisted, not just React state).
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  await expect.poll(() => adminExists(win)).toBe(true);
  win = live.win;
  await gotoHoursForm(win, L);
  await expect(openInput(win, 1)).toHaveValue('08:30');
  await expect(closeInput(win, 1)).toHaveValue('17:15');
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
