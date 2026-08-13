import { test, expect } from '@playwright/test';
import {
  CASH,
  DASH,
  boot,
  pageCrashed,
  currentMonth,
  todayIso,
  seedTodayCashTakings,
  intlMad,
  normalizeWs,
  type DashStrings,
  type Launched,
  type Locale,
} from './payments-consolidation-sou220.fixtures';

/**
 * SOU-223 — "Recette du jour" (day-takings) moves to the Dashboard "Argent"
 * card group (Basique view, every plan) and disappears from the Paiements page
 * (SOU-222 removed it there). Black-box, through the running packaged app only.
 * Both `fr` (LTR) and `ar` (RTL) projects.
 *
 * Given a center with a cash payment recorded today
 * When the director opens the Dashboard (Basique)
 * Then the "Recette du jour" figure appears in the Argent group, MAD-formatted,
 *      and no longer appears anywhere on the Paiements page.
 */

const locale = () => test.info().project.name as Locale;
const dash = (): DashStrings => DASH[locale()];

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

async function gotoDashboard(win: Launched['win'], nav: string): Promise<void> {
  await win.getByRole('link', { name: nav, exact: true }).click();
  await win.waitForTimeout(400);
}

// ---------------------------------------------------------------------------
// AC1 — "Recette du jour" appears in the Dashboard Argent group, MAD-formatted,
// with the real day-takings figure for a payment recorded today.
// ---------------------------------------------------------------------------
test('AC1 — day-takings figure appears in the Dashboard Argent card group (MAD-formatted)', async () => {
  live = await boot(locale(), 'premium');
  const win = live.win;
  const D = dash();

  const paid = await seedTodayCashTakings(win, currentMonth(), todayIso(), 275);
  // Reload so the dashboard (default route) refetches against the seeded data —
  // the same seed→reload recipe the dashboard suite uses.
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(500);

  expect(await pageCrashed(win)).toBe(false);
  expect(await win.evaluate(() => document.documentElement.dir)).toBe(locale() === 'ar' ? 'rtl' : 'ltr');

  const takingsLabel = win.getByText(D.takingsTitle, { exact: true }).first();
  await expect(takingsLabel, '"Recette du jour" label is on the dashboard').toBeVisible();

  // The label lives inside the Argent group, not in some unrelated corner.
  const argentHeading = win.getByRole('heading', { name: new RegExp(D.argentSection) }).first();
  await expect(argentHeading).toBeVisible();

  // The day-takings figure must be MAD-formatted and equal to today's takings.
  const expectedFigure = normalizeWs(await intlMad(win, locale(), paid));
  const body = normalizeWs(await win.evaluate(() => document.body.innerText));
  expect(body, 'dashboard shows the MAD-formatted day-takings amount').toContain(expectedFigure);
  expect(body, 'Argent group renders the locale MAD unit').toContain(D.currency);

  await win.screenshot({ path: `test-results/sou223-dashboard-takings-${locale()}.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// AC2 — Empty state: a fresh center (no payments today) still renders the
// "Recette du jour" figure in Argent — as a zeroed MAD amount, not missing.
// ---------------------------------------------------------------------------
test('AC2 — day-takings still renders (zeroed) on a center with no payments today', async () => {
  live = await boot(locale(), 'premium');
  const win = live.win;
  const D = dash();

  await gotoDashboard(win, D.nav);
  expect(await pageCrashed(win)).toBe(false);

  await expect(win.getByText(D.takingsTitle, { exact: true }).first()).toBeVisible();
  const zero = normalizeWs(await intlMad(win, locale(), 0));
  const body = normalizeWs(await win.evaluate(() => document.body.innerText));
  expect(body, 'zeroed day-takings figure is present').toContain(zero);
});

// ---------------------------------------------------------------------------
// AC3 — Day-takings is GONE from the Paiements page (both tabs). Checked
// against the full document text so a block merely hidden behind an inactive
// tab is still caught.
// ---------------------------------------------------------------------------
test('AC3 — "Recette du jour" no longer appears on the Paiements page', async () => {
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = CASH[locale()];
  const D = dash();

  await win.getByRole('link', { name: L.nav, exact: true }).click();
  await win.waitForTimeout(400);

  const fullText = async () => normalizeWs(await win.evaluate(() => document.documentElement.textContent ?? ''));

  await win.getByRole('tab', { name: L.record.title }).click();
  expect(await fullText(), 'takings absent on record tab').not.toContain(D.takingsTitle);

  await win.getByRole('tab', { name: L.feed.title }).click();
  expect(await fullText(), 'takings absent on feed tab').not.toContain(D.takingsTitle);

  await expect(win.getByText(D.takingsTitle)).toHaveCount(0);
});
