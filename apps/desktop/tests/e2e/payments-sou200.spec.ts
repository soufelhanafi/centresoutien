import { test, expect } from '@playwright/test';
import {
  CASH,
  boot,
  seedInvoice,
  gotoPayments,
  takingsBlockText,
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
 * SOU-200 — cash-desk `/payments` follow-ups. Black-box, through the running
 * packaged app only; both `fr` (LTR) and `ar` (RTL) projects.
 *
 *   1. Takings payment-count plural forms in FR + AR (AR: zero/one/two/few/many;
 *      FR: one/other with 0 treated as singular). No `paiement(s)` fallback.
 *   2. Reversal rows show a locale-correct negative whose minus is placed by the
 *      `Intl` formatter (fr-MA / ar-MA), not a hand-built `- ` prefix.
 *   3. The open-invoice picker is a bounded server-side read: open invoices only
 *      (cancelled excluded), name search, "load more" cursor pagination, page
 *      size 20, rows labelled by student name.
 *   4. No regression to the cash-desk flow; FR/AR + RTL parity holds.
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
// AC1 — Takings payment-count plural forms (FR one/other, AR zero/one/two/few/many).
// ---------------------------------------------------------------------------
test('AC1 — takings count renders correct plural forms for 0/1/2/few/many', async () => {
  test.setTimeout(120_000);
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = strings();
  const X = extra();

  // One high-balance open invoice absorbs many small same-day payments so the
  // takings COUNT climbs 0 → 1 → 2 → 3 (few) → 11 (many).
  const inv = await seedInvoice(win, { nameFr: 'Compteur', nameAr: 'عدّاد', month: currentMonth(), priceMad: 100000 });

  const readAtCount = async (expected: number): Promise<string> => {
    await win.reload();
    await win.waitForLoadState('domcontentloaded');
    await gotoPayments(win, L);
    const block = await takingsBlockText(win, L);
    expect(block, `count=${expected} renders "${X.count[expected]}"`).toContain(X.count[expected]);
    // Never the untranslated ICU template or raw key.
    expect(block).not.toContain('{{count}}');
    expect(block).not.toContain('takings.count');
    if (locale() === 'fr') expect(block, 'no lazy paiement(s) fallback').not.toContain(X.fallbackLiteral);
    return block;
  };

  await readAtCount(0);
  for (let i = 1; i <= 11; i++) {
    await seedPayment(win, { invoiceId: inv.invoiceId, amountMad: 1, method: 'cash', paidOn: todayIso() });
    if ([1, 2, 3, 11].includes(i)) await readAtCount(i);
  }

  // Distinct forms actually differ (guards a "one form everywhere" regression).
  expect(new Set([X.count[0], X.count[1], X.count[2], X.count[3], X.count[11]]).size, 'plural forms are distinct').toBe(5);

  await win.screenshot({ path: `test-results/sou200-count-plurals-${locale()}.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// AC2 — Reversal row shows an Intl-placed locale-correct negative amount.
// ---------------------------------------------------------------------------
test('AC2 — reversal row shows a locale-correct Intl-negative amount', async () => {
  test.setTimeout(90_000);
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = strings();
  const X = extra();

  const inv = await seedInvoice(win, { nameFr: 'Reversal Rita', nameAr: 'ريتا', month: currentMonth(), priceMad: 200 });
  await seedPayment(win, { invoiceId: inv.invoiceId, amountMad: 200, method: 'cash', paidOn: todayIso() });
  const paymentId = await latestPaymentId(win, inv.invoiceId);
  await voidPayment(win, paymentId);

  await gotoPayments(win, L);

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
// AC3 — Open-invoice picker: bounded server-side read (open only, name search,
// "load more" cursor pagination, page size 20, rows labelled by student name).
// ---------------------------------------------------------------------------
test('AC3 — open-invoice picker pages at 20, searches by name, excludes cancelled', async () => {
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
  await win.waitForTimeout(600);

  // Page size 20: exactly one page of record-actions before "load more".
  await expect(win.getByRole('button', { name: X.loadMore })).toBeVisible();
  expect(await recordActionCount(win, L.record.action), 'first page shows page-size 20').toBe(20);

  // Rows are labelled by student name.
  const firstPageName = locale() === 'ar' ? 'تلميذ 25' : 'Eleve 25';
  await expect(win.getByText(firstPageName).first()).toBeVisible();

  // The cancelled invoice's student is never offered (not cancelled, outstanding > 0).
  const cancelledName = locale() === 'ar' ? PICKER_NAMES.cancelled.ar : PICKER_NAMES.cancelled.fr;
  await expect(win.getByText(cancelledName)).toHaveCount(0);

  // "Load more" (cursor page 2) reveals the rest — 26 open total, none duplicated beyond that.
  await win.getByRole('button', { name: X.loadMore }).click();
  await win.waitForTimeout(500);
  expect(await recordActionCount(win, L.record.action), 'after one load-more all 26 open invoices are listed').toBe(26);
  await expect(win.getByRole('button', { name: X.loadMore })).toHaveCount(0);

  // Name search narrows to the single matching student (server-side filter).
  const searchToken = locale() === 'ar' ? PICKER_NAMES.searchTarget.tokenAr : PICKER_NAMES.searchTarget.tokenFr;
  const searchTargetName = locale() === 'ar' ? PICKER_NAMES.searchTarget.ar : PICKER_NAMES.searchTarget.fr;
  const search = win.getByPlaceholder(X.searchPlaceholder);
  await search.fill(searchToken);
  await win.waitForTimeout(700);

  await expect(win.getByText(searchTargetName).first()).toBeVisible();
  expect(await recordActionCount(win, L.record.action), 'search narrows to the single matching open invoice').toBe(1);
  await expect(win.getByText(firstPageName)).toHaveCount(0);

  // Searching the cancelled student's name yields no open invoice to collect.
  await search.fill(cancelledName);
  await win.waitForTimeout(700);
  expect(await recordActionCount(win, L.record.action), 'cancelled invoice is not collectable via search').toBe(0);
  await expect(win.getByText(X.noResultsTitle).first()).toBeVisible();

  await win.screenshot({ path: `test-results/sou200-picker-pagination-${locale()}.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// AC4 — No regression: the cash-desk page still renders its three sections and
// respects the active direction (RTL in AR).
// ---------------------------------------------------------------------------
test('AC4 — cash-desk flow + FR/AR RTL parity intact', async () => {
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = strings();

  await gotoPayments(win, L);

  await expect(win.getByRole('heading', { name: L.title, exact: true })).toBeVisible();
  await expect(win.getByText(L.takings.title).first()).toBeVisible();
  await expect(win.getByText(L.record.title).first()).toBeVisible();
  await expect(win.getByText(L.feed.title).first()).toBeVisible();

  const dir = await win.evaluate(() => document.documentElement.dir);
  expect(dir).toBe(locale() === 'ar' ? 'rtl' : 'ltr');

  await win.screenshot({ path: `test-results/sou200-regression-${locale()}.png`, fullPage: true });
});
