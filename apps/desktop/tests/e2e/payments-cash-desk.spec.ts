import { test, expect } from '@playwright/test';
import {
  CASH,
  boot,
  seedInvoice,
  recordFullPayment,
  gotoPayments,
  recordViaPicker,
  takingsBlockText,
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
 * SOU-198 — /payments cash-desk page. Black-box, through the running packaged
 * app only. Every spec runs under both the `fr` (LTR) and `ar` (RTL) projects.
 *
 * Critical scenarios only (money + data-loss + hard invariants): real page
 * render, empty states, record-from-picker + live refresh, fully-paid excluded
 * from the picker, reversal nets down + is marked, append-only feed, and
 * today-only takings with per-locale MAD formatting.
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
// Scenario 1 — /payments renders a real cash-desk page (three sections), never
// a generic "coming soon" module placeholder, and never crashes.
// ---------------------------------------------------------------------------
test('Scenario 1 — /payments renders the real three-section cash-desk page', async () => {
  const { win, L } = await bootAtPayments();

  expect(await pageCrashed(win)).toBe(false);
  await expect(win.getByRole('heading', { name: L.title, exact: true })).toBeVisible();
  await expect(win.getByText(L.takings.title).first()).toBeVisible();
  await expect(win.getByText(L.record.title).first()).toBeVisible();
  await expect(win.getByText(L.feed.title).first()).toBeVisible();

  const body = await win.evaluate(() => document.body.innerText);
  expect(body, 'no generic module placeholder copy').not.toMatch(/coming soon|bientôt disponible|قريبًا/i);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(locale() === 'ar' ? 'rtl' : 'ltr');
  await win.screenshot({ path: `test-results/payments-render-${locale()}.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// Scenario 2 — Empty states: a fresh center with no payments and no invoices
// shows a proper empty state for the feed and an empty picker state — not a
// crash, not a spinner-forever.
// ---------------------------------------------------------------------------
test('Scenario 2 — empty states for feed and open-invoice picker', async () => {
  const { win, L } = await bootAtPayments();

  expect(await pageCrashed(win)).toBe(false);
  await expect(win.getByText(L.feed.emptyTitle)).toBeVisible();
  await expect(win.getByText(L.record.emptyTitle)).toBeVisible();

  // No perpetual spinner: the takings section is present and settled.
  await expect(win.getByText(L.takings.title).first()).toBeVisible();
  await expect(win.getByRole('button', { name: L.record.action, exact: true })).toHaveCount(0);
  await win.screenshot({ path: `test-results/payments-empty-${locale()}.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// Scenario 3 — Record a payment from the picker against an open invoice. The
// feed and today's takings must refresh WITHOUT a manual reload.
// ---------------------------------------------------------------------------
test('Scenario 3 — record from picker refreshes takings + feed live (no reload)', async () => {
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = strings();

  const seeded = await seedInvoice(win, { nameFr: 'Yassine Alaoui', nameAr: 'ياسين العلوي', month: currentMonth(), priceMad: 200 });
  await gotoPayments(win, L);

  // Before: the feed is empty and the invoice is offered in the picker.
  await expect(win.getByText(L.feed.emptyTitle)).toBeVisible();
  await expect(win.getByRole('button', { name: L.record.action, exact: true })).toHaveCount(1);

  await recordViaPicker(win, L, { studentName: nameFor(locale(), seeded), amountMad: '200' });
  await expect(win.getByText(L.dialog.success)).toBeVisible();

  // After: no reload — the feed shows the payment and the empty state is gone.
  await expect(win.getByText(L.feed.emptyTitle)).toHaveCount(0);
  await expect(win.getByText(nameFor(locale(), seeded)).first()).toBeVisible();
  await expect(win.getByText(L.methods.cash).first()).toBeVisible();

  const takingsText = await takingsBlockText(win, L);
  expect(takingsText, 'takings block shows MAD after recording').toContain(L.currency);
  if (locale() === 'fr') expect(takingsText).toMatch(/200/);
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

  const seeded = await seedInvoice(win, { nameFr: 'Salma Bennani', nameAr: 'سلمى بناني', month: currentMonth(), priceMad: 200 });
  await recordFullPayment(win, seeded.invoiceId, 200);
  await gotoPayments(win, L);

  // Picker has nothing to collect — the only invoice is fully paid.
  await expect(win.getByText(L.record.emptyTitle)).toBeVisible();
  await expect(win.getByRole('button', { name: L.record.action, exact: true })).toHaveCount(0);

  // The feed still lists that invoice's payment (feed spans ALL invoices).
  await expect(win.getByText(nameFor(locale(), seeded)).first()).toBeVisible();
  await expect(win.getByText(L.methods.cash).first()).toBeVisible();
  await expect(win.getByText(L.feed.reversal)).toHaveCount(0);
  await win.screenshot({ path: `test-results/payments-fullypaid-excluded-${locale()}.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// Scenario 5 — A reversal reduces the netted takings total and is visually
// marked "Annulation" in the feed. Append-only: the void appends a reversal,
// it never mutates the original payment.
// ---------------------------------------------------------------------------
test('Scenario 5 — reversal nets takings down and is marked in the feed', async () => {
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = strings();

  const seeded = await seedInvoice(win, { nameFr: 'Omar Idrissi', nameAr: 'عمر الإدريسي', month: currentMonth(), priceMad: 200 });
  await gotoPayments(win, L);
  await recordViaPicker(win, L, { studentName: nameFor(locale(), seeded), amountMad: '200' });
  await expect(win.getByText(L.dialog.success)).toBeVisible();

  const beforeTakings = await takingsBlockText(win, L);
  if (locale() === 'fr') expect(beforeTakings, 'takings shows the gross before void').toMatch(/200/);

  const paymentId = await latestPaymentId(win, seeded.invoiceId);
  await voidPayment(win, paymentId);
  await gotoPayments(win, L); // re-enter the page to re-read (void was not driven from this page)
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  await gotoPayments(win, L);

  // Feed marks the reversal row.
  await expect(win.getByText(L.feed.reversal).first()).toBeVisible();

  // Netted takings dropped: payment(+200) + reversal(-200) = 0.
  const afterTakings = await takingsBlockText(win, L);
  expect(afterTakings, 'takings must change after the reversal nets it down').not.toBe(beforeTakings);
  if (locale() === 'fr') {
    expect(afterTakings, 'gross 200 is no longer the net taking').not.toMatch(/200[.,]00/);
    expect(afterTakings, 'net takings is zero').toMatch(/0[.,]00/);
  }
  await win.screenshot({ path: `test-results/payments-reversal-net-${locale()}.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// Scenario 6 — Append-only ledger: feed rows expose no edit/delete affordance.
// ---------------------------------------------------------------------------
test('Scenario 6 — recent feed rows have no edit/delete affordance', async () => {
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = strings();

  const seeded = await seedInvoice(win, { nameFr: 'Nadia Chraibi', nameAr: 'نادية الشرايبي', month: currentMonth(), priceMad: 200 });
  await seedPayment(win, { invoiceId: seeded.invoiceId, amountMad: 120, method: 'transfer', paidOn: todayIso() });
  await gotoPayments(win, L);

  await expect(win.getByText(nameFor(locale(), seeded)).first()).toBeVisible();
  await expect(win.getByRole('button', { name: L.editRe })).toHaveCount(0);
  await expect(win.getByRole('menuitem', { name: L.editRe })).toHaveCount(0);
  await win.screenshot({ path: `test-results/payments-append-only-${locale()}.png`, fullPage: true });
});

// ---------------------------------------------------------------------------
// Scenario 7 — Today's takings counts only payments dated today; a past-dated
// payment shows in the feed but not in the takings total. MAD per locale.
// ---------------------------------------------------------------------------
test('Scenario 7 — takings counts only today; past-dated payment shows in feed only', async () => {
  live = await boot(locale(), 'premium');
  const win = live.win;
  const L = strings();

  const todayInv = await seedInvoice(win, { nameFr: 'Hicham Alami', nameAr: 'هشام العلمي', month: currentMonth(), priceMad: 200 });
  const oldInv = await seedInvoice(win, { nameFr: 'Fatima Zahra', nameAr: 'فاطمة الزهراء', month: '2020-01', priceMad: 500 });
  await gotoPayments(win, L);

  // Today's payment via the picker (paidOn defaults to the app's today).
  await recordViaPicker(win, L, { studentName: nameFor(locale(), todayInv), amountMad: '200' });
  await expect(win.getByText(L.dialog.success)).toBeVisible();

  // A long-past payment on the other invoice — feed yes, today's takings no.
  await seedPayment(win, { invoiceId: oldInv.invoiceId, amountMad: 50, method: 'cash', paidOn: '2020-01-15' });
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  await gotoPayments(win, L);

  // Both appear in the cross-invoice feed.
  await expect(win.getByText(nameFor(locale(), todayInv)).first()).toBeVisible();
  await expect(win.getByText(nameFor(locale(), oldInv)).first()).toBeVisible();

  // Takings is MAD-formatted and reflects only today's 200 — never 250/700.
  const takingsText = await takingsBlockText(win, L);
  expect(takingsText).toContain(L.currency);
  if (locale() === 'fr') {
    expect(takingsText, 'today total counts the 200 recorded today').toMatch(/200/);
    expect(takingsText, 'the 2020 payment must not be added into today').not.toMatch(/250|700|550/);
  }
  await win.screenshot({ path: `test-results/payments-today-only-${locale()}.png`, fullPage: true });
});
