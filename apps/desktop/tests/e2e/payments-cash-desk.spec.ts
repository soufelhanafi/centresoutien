import { test, expect } from '@playwright/test';
import {
  CASH,
  boot,
  seedInvoice,
  recordFullPayment,
  gotoPayments,
  gotoFeedTab,
  recordTab,
  feedTab,
  recordViaPicker,
  seedPayment,
  latestPaymentId,
  voidPayment,
  nameFor,
  pageCrashed,
  todayIso,
  currentMonth,
  type CashStrings,
  type Launched,
  type Locale,
} from './payments-cash-desk.fixtures';

/**
 * SOU-198 / SOU-222 — /payments cash-desk page. Black-box, through the running
 * packaged app only. Every spec runs under both the `fr` (LTR) and `ar` (RTL)
 * projects.
 *
 * The page is a tabbed workspace (SOU-222): a record-payment tab (default) with
 * the open-invoice picker, and a recent-payments feed tab. Radix `TabsContent`
 * unmounts the inactive panel, so feed content is asserted only after switching
 * to the feed tab. The "Recette du jour" day-takings summary moved off this page
 * to the Dashboard (SOU-223); its coverage lives with the dashboard, not here.
 *
 * Critical scenarios only (money + data-loss + hard invariants): real page
 * render, empty states, record-from-picker + live feed refresh, fully-paid
 * excluded from the picker, reversal appended + marked, append-only feed, and a
 * cross-invoice feed spanning dates.
 */

const locale = () => test.info().project.name as Locale;
const strings = (): CashStrings => CASH[locale()];

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

async function bootAtPayments(): Promise<{ win: Launched['win']; L: CashStrings }> {
  live = await boot(locale(), 'premium');
  const L = strings();
  await gotoPayments(live.win, L);
  return { win: live.win, L };
}

// ---------------------------------------------------------------------------
// Scenario 1 — /payments renders a real tabbed cash-desk page (record + feed
// tabs), never a generic "coming soon" module placeholder, and never crashes.
// ---------------------------------------------------------------------------
test('Scenario 1 — /payments renders the real tabbed cash-desk page', async () => {
  const { win, L } = await bootAtPayments();

  expect(await pageCrashed(win)).toBe(false);
  await expect(win.getByRole('heading', { name: L.title, exact: true })).toBeVisible();

  await expect(recordTab(win, L)).toBeVisible();
  await expect(feedTab(win, L)).toBeVisible();
  await expect(recordTab(win, L)).toHaveAttribute('aria-selected', 'true');

  const body = await win.evaluate(() => document.body.innerText);
  expect(body, 'no generic module placeholder copy').not.toMatch(/coming soon|bientôt disponible|قريبًا/i);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(locale() === 'ar' ? 'rtl' : 'ltr');
  await win.screenshot({ path: `test-results/payments-render-${locale()}.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// Scenario 2 — Empty states: a fresh center with no payments and no invoices
// shows a proper empty state for the picker (record tab) and for the feed (feed
// tab) — not a crash, not a spinner-forever.
// ---------------------------------------------------------------------------
test('Scenario 2 — empty states for feed and open-invoice picker', async () => {
  const { win, L } = await bootAtPayments();

  expect(await pageCrashed(win)).toBe(false);

  // Record tab (default): empty open-invoice picker, nothing to collect.
  await expect(win.getByText(L.record.emptyTitle)).toBeVisible();
  await expect(win.getByRole('button', { name: L.record.action, exact: true })).toHaveCount(0);

  // Feed tab: a settled empty state, not a perpetual spinner.
  await gotoFeedTab(win, L);
  await expect(win.getByText(L.feed.emptyTitle)).toBeVisible();
  await win.screenshot({ path: `test-results/payments-empty-${locale()}.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Record a payment from the picker against an open invoice. The
// feed must reflect it WITHOUT a manual window reload.
// ---------------------------------------------------------------------------
test('Scenario 3 — record from picker refreshes the feed live (no reload)', async () => {
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = strings();

  const seeded = await seedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: currentMonth(), priceMad: 200, issue: true });
  await gotoPayments(win, L);

  // Record tab (default): the open invoice is offered in the picker.
  await expect(win.getByRole('button', { name: L.record.action, exact: true })).toHaveCount(1);

  await recordViaPicker(win, L, { studentName: nameFor(locale(), seeded), amountMad: '200' });
  await expect(win.getByText(L.dialog.success)).toBeVisible();

  // Feed tab now lists the payment — no window reload, the feed query refetched.
  await gotoFeedTab(win, L);
  await expect(win.getByText(L.feed.emptyTitle)).toHaveCount(0);
  await expect(win.getByText(nameFor(locale(), seeded)).first()).toBeVisible();
  await expect(win.getByText(L.methods.cash).first()).toBeVisible();
  await win.screenshot({ path: `test-results/payments-record-refresh-${locale()}.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// Scenario 4 — A fully-paid invoice does NOT appear in the open-invoice picker,
// yet its payment still shows in the cross-invoice recent feed.
// ---------------------------------------------------------------------------
test('Scenario 4 — fully-paid invoice excluded from picker, still in the feed', async () => {
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = strings();

  const seeded = await seedInvoice(win, { nameFr: 'Salma Bennani', nameAr: 'سلمى بناني', month: currentMonth(), priceMad: 200, issue: true });
  await recordFullPayment(win, seeded.invoiceId, 200);
  await gotoPayments(win, L);

  // Record tab: nothing to collect — the only invoice is fully paid.
  await expect(win.getByText(L.record.emptyTitle)).toBeVisible();
  await expect(win.getByRole('button', { name: L.record.action, exact: true })).toHaveCount(0);

  // Feed tab still lists that invoice's payment (feed spans ALL invoices).
  await gotoFeedTab(win, L);
  await expect(win.getByText(nameFor(locale(), seeded)).first()).toBeVisible();
  await expect(win.getByText(L.methods.cash).first()).toBeVisible();
  await expect(win.getByText(L.feed.reversal)).toHaveCount(0);
  await win.screenshot({ path: `test-results/payments-fullypaid-excluded-${locale()}.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// Scenario 5 — A reversal is appended and visually marked "Annulation" in the
// feed. Append-only: the void appends a reversal row, it never mutates the
// original payment (which remains listed).
// ---------------------------------------------------------------------------
test('Scenario 5 — reversal is appended and marked in the feed', async () => {
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = strings();

  const seeded = await seedInvoice(win, { nameFr: 'Omar Idrissi', nameAr: 'عمر الإدريسي', month: currentMonth(), priceMad: 200, issue: true });
  await gotoPayments(win, L);
  await recordViaPicker(win, L, { studentName: nameFor(locale(), seeded), amountMad: '200' });
  await expect(win.getByText(L.dialog.success)).toBeVisible();

  const paymentId = await latestPaymentId(win, seeded.invoiceId);
  await voidPayment(win, paymentId);
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  await gotoPayments(win, L);
  await gotoFeedTab(win, L);

  // Feed marks the reversal row…
  await expect(win.getByText(L.feed.reversal).first()).toBeVisible();
  // …and the original payment row remains (append-only — the student is still listed).
  await expect(win.getByText(nameFor(locale(), seeded)).first()).toBeVisible();
  await win.screenshot({ path: `test-results/payments-reversal-net-${locale()}.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// Scenario 6 — Append-only ledger: feed rows expose no edit/delete affordance.
// ---------------------------------------------------------------------------
test('Scenario 6 — recent feed rows have no edit/delete affordance', async () => {
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = strings();

  const seeded = await seedInvoice(win, { nameFr: 'Nadia Chraibi', nameAr: 'نادية الشرايبي', month: currentMonth(), priceMad: 200, issue: true });
  await seedPayment(win, { invoiceId: seeded.invoiceId, amountMad: 120, method: 'transfer', paidOn: todayIso() });
  await gotoPayments(win, L);
  await gotoFeedTab(win, L);

  await expect(win.getByText(nameFor(locale(), seeded)).first()).toBeVisible();
  await expect(win.getByRole('button', { name: L.editRe })).toHaveCount(0);
  await expect(win.getByRole('menuitem', { name: L.editRe })).toHaveCount(0);
  await win.screenshot({ path: `test-results/payments-append-only-${locale()}.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// Scenario 7 — The recent feed spans all invoices and all dates: a today
// payment and a long-past payment both appear in the cross-invoice feed.
// ---------------------------------------------------------------------------
test('Scenario 7 — feed spans all dates; a past-dated payment shows in the feed', async () => {
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = strings();

  const todayInv = await seedInvoice(win, { nameFr: 'Hicham Alami', nameAr: 'هشام العلمي', month: currentMonth(), priceMad: 200, issue: true });
  const oldInv = await seedInvoice(win, { nameFr: 'Fatima Zahra', nameAr: 'فاطمة الزهراء', month: '2020-01', priceMad: 500, issue: true });

  // A today payment and a long-past payment, each on its own invoice — recorded
  // straight through the bridge with explicit dates so the feed's DATE SPAN is
  // what's under test here, not the picker (picker→feed is Scenario 3). Seeding
  // by invoiceId also keeps the two payments unambiguously on their own invoices.
  await seedPayment(win, { invoiceId: todayInv.invoiceId, amountMad: 200, method: 'cash', paidOn: todayIso() });
  await seedPayment(win, { invoiceId: oldInv.invoiceId, amountMad: 50, method: 'cash', paidOn: '2020-01-15' });

  await gotoPayments(win, L);
  await gotoFeedTab(win, L);

  // Both appear in the cross-invoice feed regardless of their dates.
  await expect(win.getByText(nameFor(locale(), todayInv)).first()).toBeVisible();
  await expect(win.getByText(nameFor(locale(), oldInv)).first()).toBeVisible();
  await win.screenshot({ path: `test-results/payments-feed-spans-dates-${locale()}.png`, fullPage: true });
});
