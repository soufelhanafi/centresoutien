import { test, expect } from '@playwright/test';
import {
  CASH,
  FEED_FILTERS,
  boot,
  pageCrashed,
  currentMonth,
  todayIso,
  dayOffsetIso,
  seedFeedPayments,
  type CashStrings,
  type FeedFilterStrings,
  type Launched,
  type Locale,
} from './payments-consolidation-sou220.fixtures';

/**
 * SOU-225 — the "Derniers encaissements" tab gains a date range (from/to) and a
 * payment-method select. Applying a filter narrows the feed; clearing restores
 * it. Black-box, through the running packaged app only. Both `fr` (LTR) and
 * `ar` (RTL) projects.
 */

const locale = () => test.info().project.name as Locale;
const cash = (): CashStrings => CASH[locale()];
const flt = (): FeedFilterStrings => FEED_FILTERS[locale()];

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

async function openFeedTab(win: Launched['win'], L: CashStrings): Promise<void> {
  await win.getByRole('link', { name: L.nav, exact: true }).click();
  const feedTab = win.getByRole('tab', { name: L.feed.title });
  await expect(feedTab).toBeVisible();
  await feedTab.click();
  await expect(feedTab).toHaveAttribute('aria-selected', 'true');
}

async function selectMethod(win: Launched['win'], F: FeedFilterStrings, optionLabel: string): Promise<void> {
  await win.getByRole('combobox', { name: F.method }).click();
  const option = win.getByRole('option', { name: optionLabel, exact: true });
  await expect(option).toBeVisible();
  await option.click();
  await expect(win.getByRole('combobox', { name: F.method })).toContainText(optionLabel);
}

/** Clear all feed filters — via the Réinitialiser button if it surfaced, else manually. */
async function clearFilters(win: Launched['win'], F: FeedFilterStrings): Promise<void> {
  const resetBtn = win.getByRole('button', { name: F.reset, exact: true });
  if (await resetBtn.count()) {
    await resetBtn.first().click();
  } else {
    await selectMethod(win, F, F.allMethods);
    await win.getByLabel(F.from, { exact: true }).fill('');
    await win.getByLabel(F.to, { exact: true }).fill('');
  }
  await expect(win.getByRole('combobox', { name: F.method })).toContainText(F.allMethods);
}

// ---------------------------------------------------------------------------
// AC1 — The feed tab exposes the filter controls: from + to date inputs and a
// method select defaulting to "Tous les moyens".
// ---------------------------------------------------------------------------
test('AC1 — feed tab shows date-range + method filter controls', async () => {
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = cash();
  const F = flt();

  await seedFeedPayments(win, currentMonth(), [
    { nameFr: 'Karim Cash', nameAr: 'كريم نقدي', method: 'cash', amountMad: 100, paidOn: todayIso() },
  ]);
  await openFeedTab(win, L);
  expect(await pageCrashed(win)).toBe(false);

  await expect(win.getByLabel(F.from, { exact: true })).toBeVisible();
  await expect(win.getByLabel(F.to, { exact: true })).toBeVisible();
  const methodSelect = win.getByRole('combobox', { name: F.method });
  await expect(methodSelect).toBeVisible();
  await expect(methodSelect, 'method select defaults to "all methods"').toContainText(F.allMethods);

  await win.screenshot({ path: `test-results/sou225-feed-filters-${locale()}.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// AC2 — Method filter narrows the feed; clearing restores it. Two payments
// today (one cash, one cheque): selecting "Chèque" leaves only the cheque row.
// ---------------------------------------------------------------------------
test('AC2 — method filter narrows the feed, clearing restores it', async () => {
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = cash();
  const F = flt();

  const cashName = locale() === 'ar' ? 'كريم نقدي' : 'Karim Cash';
  const chequeName = locale() === 'ar' ? 'سعاد شيك' : 'Souad Cheque';
  await seedFeedPayments(win, currentMonth(), [
    { nameFr: 'Karim Cash', nameAr: 'كريم نقدي', method: 'cash', amountMad: 100, paidOn: todayIso() },
    { nameFr: 'Souad Cheque', nameAr: 'سعاد شيك', method: 'cheque', amountMad: 200, paidOn: todayIso() },
  ]);
  await openFeedTab(win, L);

  // Both rows present before filtering.
  await expect(win.getByText(cashName, { exact: false }).first()).toBeVisible();
  await expect(win.getByText(chequeName, { exact: false }).first()).toBeVisible();

  // Filter to Chèque → only the cheque row remains.
  await selectMethod(win, F, L.methods.cheque);
  await expect(win.getByText(chequeName, { exact: false }).first()).toBeVisible();
  await expect(win.getByText(cashName, { exact: false }), 'cash row filtered out').toHaveCount(0);
  await win.screenshot({ path: `test-results/sou225-method-filtered-${locale()}.png`, fullPage: true });

  // Clear → both rows restored.
  await clearFilters(win, F);
  await expect(win.getByText(cashName, { exact: false }).first()).toBeVisible();
  await expect(win.getByText(chequeName, { exact: false }).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// AC3 — Date-range filter narrows the feed; clearing restores it. A "to" bound
// before today excludes today's payments (no-results state), then clearing the
// range brings them back.
// ---------------------------------------------------------------------------
test('AC3 — date-range filter narrows the feed, clearing restores it', async () => {
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = cash();
  const F = flt();

  const name = locale() === 'ar' ? 'كريم نقدي' : 'Karim Cash';
  await seedFeedPayments(win, currentMonth(), [
    { nameFr: 'Karim Cash', nameAr: 'كريم نقدي', method: 'cash', amountMad: 100, paidOn: todayIso() },
  ]);
  await openFeedTab(win, L);
  await expect(win.getByText(name, { exact: false }).first()).toBeVisible();

  // "to" = yesterday excludes today's payment → no results. The narrowed feed is
  // itself the deterministic wait: the row disappears and the no-results state shows.
  await win.getByLabel(F.to, { exact: true }).fill(dayOffsetIso(-1));
  await expect(win.getByText(name, { exact: false }), "today's row excluded by the date bound").toHaveCount(0);
  await expect(win.getByText(F.noResultsTitle).first()).toBeVisible();
  await win.screenshot({ path: `test-results/sou225-date-filtered-${locale()}.png`, fullPage: true });

  // Clear → row restored.
  await clearFilters(win, F);
  await expect(win.getByText(name, { exact: false }).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// AC4 — AR-RTL: the feed panel inherits dir=rtl and the filter controls render
// under RTL. Only meaningful under the `ar` project.
// ---------------------------------------------------------------------------
test('AC4 — AR-RTL feed filters render right-to-left', async () => {
  test.skip(locale() !== 'ar', 'RTL assertion is AR-only');
  live = await boot('ar', 'premium');
  const win = live.win;
  const L = CASH.ar;
  const F = FEED_FILTERS.ar;

  await seedFeedPayments(win, currentMonth(), [
    { nameFr: 'Karim Cash', nameAr: 'كريم نقدي', method: 'cash', amountMad: 100, paidOn: todayIso() },
  ]);
  await openFeedTab(win, L);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe('rtl');
  await expect(win.getByLabel(F.from, { exact: true })).toBeVisible();
  await expect(win.getByRole('combobox', { name: F.method })).toBeVisible();

  // Filtering still works under RTL.
  await selectMethod(win, F, L.methods.cash);
  await expect(win.getByText('كريم نقدي', { exact: false }).first()).toBeVisible();
});
