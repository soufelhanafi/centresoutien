import { test, expect } from '@playwright/test';
import {
  CASH,
  boot,
  seedInvoice,
  gotoPayments,
  nameFor,
  pageCrashed,
  currentMonth,
  type CashStrings,
  type Launched,
  type Locale,
} from './payments-cash-desk.fixtures';

/**
 * SOU-222 — Restructure Paiements ("Caisse") into tabs. Black-box, through the
 * running packaged app only. Every spec runs under both the `fr` (LTR) and `ar`
 * (RTL) projects.
 *
 * Acceptance criteria under test:
 *   1. The Caisse page shows TABS — "Enregistrer un paiement" (record flow) and
 *      "Derniers encaissements" (recent feed).
 *   2. Switching tabs reveals the matching panel; the other panel is hidden.
 *   3. "Recette du jour" (day-takings) is NO LONGER on the Paiements page.
 *   4. Correct in both FR-LTR and AR-RTL (tabs render right-to-left under dir=rtl).
 */

const locale = () => test.info().project.name as Locale;
const strings = (): CashStrings => CASH[locale()];

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

function recordTab(win: Launched['win'], L: CashStrings) {
  return win.getByRole('tab', { name: L.record.title });
}
function feedTab(win: Launched['win'], L: CashStrings) {
  return win.getByRole('tab', { name: L.feed.title });
}

// ---------------------------------------------------------------------------
// AC1 — The Caisse page shows two tabs: record + recent feed.
// ---------------------------------------------------------------------------
test('AC1 — Caisse page shows the two tabs (record + recent feed)', async () => {
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = strings();
  await gotoPayments(win, L);

  expect(await pageCrashed(win)).toBe(false);
  await expect(win.getByRole('heading', { name: L.title, exact: true })).toBeVisible();

  await expect(recordTab(win, L)).toBeVisible();
  await expect(feedTab(win, L)).toBeVisible();
  // Exactly the two tabs described by the criteria — no stray third tab.
  await expect(win.getByRole('tab')).toHaveCount(2);

  await win.screenshot({ path: `test-results/sou222-tabs-${locale()}.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// AC2 — Switching tabs reveals the matching panel; the other is hidden.
// A single open invoice makes the two panels unambiguously distinguishable:
//   record panel  -> shows the "Encaisser" action for the open invoice
//   feed panel    -> shows the "Aucun encaissement" empty state
// ---------------------------------------------------------------------------
test('AC2 — each tab reveals its own panel and hides the other', async () => {
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = strings();

  const seeded = await seedInvoice(win, {
    nameFr: 'Yassine Alaoui',
    nameAr: 'ياسين العلوي',
    month: currentMonth(),
    priceMad: 200,
    issue: true,
  });
  await gotoPayments(win, L);

  // Record tab active -> picker visible, feed panel hidden.
  await recordTab(win, L).click();
  await expect(recordTab(win, L)).toHaveAttribute('aria-selected', 'true');
  await expect(win.getByRole('button', { name: L.record.action, exact: true })).toHaveCount(1);
  await expect(win.getByText(nameFor(locale(), seeded)).first()).toBeVisible();
  await expect(win.getByText(L.feed.emptyTitle)).toHaveCount(0);
  await win.screenshot({ path: `test-results/sou222-record-panel-${locale()}.png`, fullPage: true });

  // Feed tab active -> feed panel visible, record picker hidden.
  await feedTab(win, L).click();
  await expect(feedTab(win, L)).toHaveAttribute('aria-selected', 'true');
  await expect(win.getByText(L.feed.emptyTitle)).toBeVisible();
  await expect(win.getByRole('button', { name: L.record.action, exact: true })).toHaveCount(0);
  await win.screenshot({ path: `test-results/sou222-feed-panel-${locale()}.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// AC3 — "Recette du jour" (day-takings) is gone from the Paiements page, on
// either tab. Checked against the FULL document text (incl. hidden panels), so
// a takings block merely hidden behind an inactive tab would still be caught.
// ---------------------------------------------------------------------------
test('AC3 — "Recette du jour" no longer appears on the Caisse page', async () => {
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = strings();
  await gotoPayments(win, L);

  const fullText = async () => win.evaluate(() => document.documentElement.textContent ?? '');

  await recordTab(win, L).click();
  expect(await fullText(), 'takings title absent on record tab').not.toContain(L.takings.title);

  await feedTab(win, L).click();
  const onFeed = await fullText();
  expect(onFeed, 'takings title absent on feed tab').not.toContain(L.takings.title);
  expect(onFeed, 'takings by-method label absent').not.toContain(L.takings.byMethodLabel);

  await expect(win.getByText(L.takings.title)).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// AC4 — AR-RTL: under dir=rtl the tablist is right-to-left. Only meaningful
// under the `ar` project; skipped under `fr`.
// ---------------------------------------------------------------------------
test('AC4 — AR-RTL tabs render right-to-left', async () => {
  test.skip(locale() !== 'ar', 'RTL ordering assertion is AR-only');
  live = await boot('ar', 'premium');
  const win = live.win;
  const L = CASH.ar;
  await gotoPayments(win, L);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe('rtl');

  const tablist = win.getByRole('tablist').first();
  await expect(tablist).toBeVisible();
  const flow = await tablist.evaluate((el) => getComputedStyle(el).direction);
  expect(flow, 'tablist inherits rtl direction').toBe('rtl');

  // The first tab in visual order (leftmost by geometry) must sit to the RIGHT
  // of the second tab's box when direction is rtl.
  const rTab = recordTab(win, L);
  const fTab = feedTab(win, L);
  await expect(rTab).toBeVisible();
  await expect(fTab).toBeVisible();
  const rBox = await rTab.boundingBox();
  const fBox = await fTab.boundingBox();
  expect(rBox && fBox).toBeTruthy();
  if (rBox && fBox) {
    // "Enregistrer un paiement" is the first tab -> in RTL it is the rightmost.
    expect(rBox.x, 'first tab is to the right of the second under rtl').toBeGreaterThan(fBox.x);
  }
  await win.screenshot({ path: `test-results/sou222-rtl-tabs-ar.png`, fullPage: true });
});
