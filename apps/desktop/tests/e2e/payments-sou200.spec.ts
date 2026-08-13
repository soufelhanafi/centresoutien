import { test, expect } from '@playwright/test';
import {
  CASH,
  boot,
  seedInvoice,
  gotoPayments,
  gotoFeedTab,
  recordTab,
  feedTab,
  seedPayment,
  latestPaymentId,
  voidPayment,
  todayIso,
  currentMonth,
  type CashStrings,
  type Launched,
  type Locale,
} from './payments-cash-desk.fixtures';
import {
  SOU200,
  PICKER_NAMES,
  seedPickerBatch,
  intlMad,
  recordActionCount,
  type Sou200Strings,
} from './payments-sou200.fixtures';

/**
 * SOU-200 — cash-desk `/payments` follow-ups, on the tabbed page (SOU-222).
 * Black-box, through the running packaged app only; both `fr` (LTR) and `ar`
 * (RTL) projects.
 *
 *   1. Reversal rows show a locale-correct negative whose minus is placed by the
 *      `Intl` formatter (fr-MA / ar-MA), not a hand-built "- " prefix.
 *   2. The open-invoice picker is a bounded server-side read: open invoices only
 *      (cancelled excluded), name search, "load more" cursor pagination, page
 *      size 20, rows labelled by student name.
 *   3. No regression to the cash-desk flow; FR/AR + RTL parity holds.
 *
 * The day-takings payment-count plural coverage moved off this page with the
 * "Recette du jour" summary (SOU-222 → Dashboard SOU-223) and lives with the
 * dashboard now.
 */

const locale = () => test.info().project.name as Locale;
const strings = (): CashStrings => CASH[locale()];
const extra = (): Sou200Strings => SOU200[locale()];

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

// ---------------------------------------------------------------------------
// AC1 — Reversal row shows an Intl-placed locale-correct negative amount.
// ---------------------------------------------------------------------------
test('AC1 — reversal row shows a locale-correct Intl-negative amount', async () => {
  test.setTimeout(90_000);
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = strings();
  const X = extra();

  const inv = await seedInvoice(win, { nameFr: 'Reversal Rita', nameAr: 'ريتا', month: currentMonth(), priceMad: 200, issue: true });
  await seedPayment(win, { invoiceId: inv.invoiceId, amountMad: 200, method: 'cash', paidOn: todayIso() });
  const paymentId = await latestPaymentId(win, inv.invoiceId);
  await voidPayment(win, paymentId);

  await gotoPayments(win, L);
  await gotoFeedTab(win, L);

  // The reversal is marked in the feed…
  await expect(win.getByText(X.reversal).first()).toBeVisible();

  // …and its amount is exactly what Intl(locale) produces for -200 — the minus
  // is placed by the formatter (fr-MA: "-200,00 MAD"; ar-MA: RTL-marked minus),
  // never a hand-built "- " prefix on the absolute value.
  const intlNeg = await intlMad(win, locale(), -200);
  const intlPos = await intlMad(win, locale(), 200);
  const feedText = await win.evaluate(() => document.body.innerText);

  expect(feedText, `feed contains the Intl negative "${intlNeg}"`).toContain(intlNeg);
  expect(feedText, 'no hand-built "- <positive>" prefix').not.toContain(`- ${intlPos}`);

  await win.screenshot({ path: `test-results/sou200-reversal-negative-${locale()}.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// AC2 — Open-invoice picker: bounded server-side read (open only, name search,
// "load more" cursor pagination, page size 20, rows labelled by student name).
// ---------------------------------------------------------------------------
test('AC2 — open-invoice picker pages at 20, searches by name, excludes cancelled', async () => {
  test.setTimeout(120_000);
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = strings();
  const X = extra();

  // 25 plain open invoices + 1 distinctly-named open (search target) + 1
  // cancelled (must never appear) = 26 OPEN invoices.
  const { openCount } = await seedPickerBatch(win, { month: currentMonth(), batch: 25, priceMad: 200 });
  expect(openCount).toBe(26);

  await gotoPayments(win, L);

  // Page size 20: exactly one page of record-actions before "load more".
  await expect(win.getByRole('button', { name: X.loadMore })).toBeVisible();
  await expect
    .poll(() => recordActionCount(win, L.record.action), { message: 'first page shows page-size 20' })
    .toBe(20);

  // Rows are labelled by student name.
  const firstPageName = locale() === 'ar' ? 'تلميذ 25' : 'Eleve 25';
  await expect(win.getByText(firstPageName).first()).toBeVisible();

  // The cancelled invoice's student is never offered (not cancelled, outstanding > 0).
  const cancelledName = locale() === 'ar' ? PICKER_NAMES.cancelled.ar : PICKER_NAMES.cancelled.fr;
  await expect(win.getByText(cancelledName)).toHaveCount(0);

  // "Load more" (cursor page 2) reveals the rest — 26 open total, none duplicated beyond that.
  await win.getByRole('button', { name: X.loadMore }).click();
  await expect
    .poll(() => recordActionCount(win, L.record.action), {
      message: 'after one load-more all 26 open invoices are listed',
    })
    .toBe(26);
  await expect(win.getByRole('button', { name: X.loadMore })).toHaveCount(0);

  // Name search narrows to the single matching student (server-side filter).
  const searchToken = locale() === 'ar' ? PICKER_NAMES.searchTarget.tokenAr : PICKER_NAMES.searchTarget.tokenFr;
  const searchTargetName = locale() === 'ar' ? PICKER_NAMES.searchTarget.ar : PICKER_NAMES.searchTarget.fr;
  const search = win.getByPlaceholder(X.searchPlaceholder);
  await search.fill(searchToken);

  await expect(win.getByText(searchTargetName).first()).toBeVisible();
  await expect
    .poll(() => recordActionCount(win, L.record.action), {
      message: 'search narrows to the single matching open invoice',
    })
    .toBe(1);
  await expect(win.getByText(firstPageName)).toHaveCount(0);

  // Searching the cancelled student's name yields no open invoice to collect.
  await search.fill(cancelledName);
  await expect
    .poll(() => recordActionCount(win, L.record.action), {
      message: 'cancelled invoice is not collectable via search',
    })
    .toBe(0);
  await expect(win.getByText(X.noResultsTitle).first()).toBeVisible();

  await win.screenshot({ path: `test-results/sou200-picker-pagination-${locale()}.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// AC3 — No regression: the cash-desk page still renders its two tabs and
// respects the active direction (RTL in AR).
// ---------------------------------------------------------------------------
test('AC3 — cash-desk tabs + FR/AR RTL parity intact', async () => {
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = strings();

  await gotoPayments(win, L);

  await expect(win.getByRole('heading', { name: L.title, exact: true })).toBeVisible();
  await expect(recordTab(win, L)).toBeVisible();
  await expect(feedTab(win, L)).toBeVisible();

  const dir = await win.evaluate(() => document.documentElement.dir);
  expect(dir).toBe(locale() === 'ar' ? 'rtl' : 'ltr');

  await win.screenshot({ path: `test-results/sou200-regression-${locale()}.png`, fullPage: true });
});
