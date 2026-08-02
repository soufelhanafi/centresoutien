import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  boot,
  gotoPayroll,
  pageCrashed,
  invokeBridge,
  invokeBridgeExpectingError,
  type Launched,
  type Locale,
} from './payroll-dashboard.fixtures';

/**
 * SOU-76 — Payroll dashboard (per month, per teacher, drill-down). Black-box,
 * driven only through the running packaged app. Runs under both the `fr`
 * (LTR) and `ar` (RTL) Playwright projects.
 *
 * Critical-only per SOU-142: money-correctness (single/bulk confirm, the
 * "already paid" immutability guard, generate-payslips never mutating
 * status) and the Essentiel plan lock are the scenarios with real business
 * risk. The attribution math itself (SOU-73's equal-split policy) is
 * covered by domain unit tests; here the drill-down is only checked for
 * wiring — it renders the panel and its empty state without crashing.
 */

const locale = () => test.info().project.name as Locale;
const MONTH = '2026-08';

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

const KARIM = { kind: 'fixed-monthly' as const, nameFr: 'Karim Idrissi', nameAr: 'كريم الإدريسي', phone: '0612345678', amountMad: 300000 };
const SANAE = {
  kind: 'percentage-of-monthly-fees' as const,
  nameFr: 'Sanae Bennani',
  nameAr: 'سناء بنعني',
  phone: '0622334455',
  percent: 30,
};

function shot(name: string): string {
  return test.info().outputPath(`sou76-${name}-${test.info().project.name}.png`);
}

async function assertMounted(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  expect(await pageCrashed(win), 'Payroll dashboard rendered without the error boundary').toBe(false);
  await expect(win.getByRole('heading', { level: 1, name: L.pageTitle })).toBeVisible();
}

// ---------------------------------------------------------------------------
// Scenario 1 — Essentiel plan: the LockOverlay shows, not the dashboard.
// ---------------------------------------------------------------------------
test('Scenario 1 — Essentiel plan shows the LockOverlay instead of the dashboard', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { plan: 'essentiel', month: MONTH, teachers: [] });
  const win = live.win;

  // On Essentiel the sidebar renders the payroll entry as a disabled, non-
  // navigating `<button>` (its accessible name includes the "PRO" badge, e.g.
  // "PaiePRO") rather than a link — clicking it is a no-op by design. Route
  // to the page directly, the same way a stale bookmark or deep link would,
  // to prove the route-level gate itself (not just the sidebar affordance).
  await win.evaluate(() => {
    window.location.hash = '#/payroll';
  });
  await win.waitForTimeout(500);

  // "Paie"/"أجور الأساتذة" also appears in the (aria-hidden) blurred content
  // behind the overlay and in the sidebar's disabled nav button, so scope the
  // title assertion to the lock card itself, found via its unique body copy.
  const lockedBodyText = win.getByText(L.lockedBody, { exact: true });
  await expect(lockedBodyText).toBeVisible();
  const lockCard = lockedBodyText.locator('xpath=..');
  await expect(lockCard).toContainText(L.lockedTitle);

  // The blurred dashboard behind the overlay is `inert` (removed from the
  // accessibility tree, so `getByRole` cannot see it) — assert its disabled
  // state directly on the DOM instead, confirming the underlying controls
  // are truly non-interactive, not just visually dimmed.
  const bulkButtonDisabled = await win.evaluate((label) => {
    const button = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes(label));
    return button?.disabled ?? null;
  }, L.bulkMarkPaidButton);
  expect(bulkButtonDisabled, 'the bulk action behind the lock overlay must be disabled, not merely blurred').toBe(true);
  await win.screenshot({ path: shot('essentiel-lock') });
});

// ---------------------------------------------------------------------------
// Scenario 2 — List view + single-row confirm: draft -> paid, visually
// distinct status, action disappears once paid (can't be re-triggered from
// the UI).
// ---------------------------------------------------------------------------
test('Scenario 2 — list shows draft payouts; single confirm flips draft to paid and hides the action', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { month: MONTH, teachers: [KARIM] });
  const win = live.win;
  await gotoPayroll(win, L);
  await assertMounted(win, L);

  const row = win.getByRole('row', { name: new RegExp(KARIM.nameFr) });
  await expect(row).toContainText(L.kind.fixedMonthly);
  await expect(row).toContainText(L.status.draft);
  const draftBadgeClass = await row.locator('td span.font-semibold').getAttribute('class');
  expect(draftBadgeClass, 'draft status must use the warning badge token').toContain('badge-warning');
  await win.screenshot({ path: shot('list-draft') });

  await row.getByRole('button', { name: L.rowConfirmAction }).click();
  await expect(win.getByText(L.singleConfirmSuccess)).toBeVisible();

  await expect(row).toContainText(L.status.paid);
  const paidBadgeClass = await row.locator('td span.font-semibold').getAttribute('class');
  expect(paidBadgeClass, 'paid status must use the success badge token, visually distinct from draft').toContain('badge-success');
  await expect(row.getByRole('button', { name: L.rowConfirmAction })).toHaveCount(0);
  await win.screenshot({ path: shot('list-paid') });
});

// ---------------------------------------------------------------------------
// Scenario 3 — A paid payout cannot be re-confirmed: it errors loudly rather
// than silently no-opping. The UI never offers this action once paid
// (Scenario 2), so this drives the boundary the ticket explicitly calls out
// directly through the preload bridge.
// ---------------------------------------------------------------------------
test('Scenario 3 — confirming an already-paid payout rejects with a domain error, not a silent no-op', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { month: MONTH, teachers: [KARIM] });
  const win = live.win;

  const payoutId = (
    await invokeBridge<{ payouts: { id: string; teacherId: string }[] }>(win, 'payroll.listPayouts', { month: MONTH })
  ).payouts[0]?.id;
  expect(payoutId, 'the compute job must have produced one payout for the seeded teacher').toBeTruthy();

  const first = await invokeBridge<{ payout: { status: string } }>(win, 'payroll.confirmPayout', { teacherPayoutId: payoutId });
  expect(first.payout.status).toBe('paid');

  const second = await invokeBridgeExpectingError(win, 'payroll.confirmPayout', { teacherPayoutId: payoutId });
  expect(second.code, 'a repeat confirm on an already-paid payout must surface the stable error code').toBe(
    'teacher-payout-already-paid',
  );

  await gotoPayroll(win, L);
  const row = win.getByRole('row', { name: new RegExp(KARIM.nameFr) });
  await expect(row).toContainText(L.status.paid);
});

// ---------------------------------------------------------------------------
// Scenario 4 — Bulk "Mark all paid": confirms every live draft for the
// month, skips-and-counts rows already paid (mirrors ComputeMonthlyPayrolls'
// skippedAlreadyPaid — a bulk confirm naturally revisits already-settled
// rows, unlike the single-row action which rejects a repeat target).
// ---------------------------------------------------------------------------
test('Scenario 4 — bulk "mark all paid" confirms every draft and skip-counts an already-paid row', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { month: MONTH, teachers: [KARIM, SANAE] });
  const win = live.win;
  await gotoPayroll(win, L);
  await assertMounted(win, L);

  const karimRow = win.getByRole('row', { name: new RegExp(KARIM.nameFr) });
  await karimRow.getByRole('button', { name: L.rowConfirmAction }).click();
  await expect(win.getByText(L.singleConfirmSuccess)).toBeVisible();

  await win.getByRole('button', { name: L.bulkMarkPaidButton }).click();
  await expect(win.getByText(L.bulkConfirmToast(1, 1))).toBeVisible();

  await expect(karimRow).toContainText(L.status.paid);
  const sanaeRow = win.getByRole('row', { name: new RegExp(SANAE.nameFr) });
  await expect(sanaeRow).toContainText(L.status.paid);
  await win.screenshot({ path: shot('bulk-confirm') });
});

// ---------------------------------------------------------------------------
// Scenario 5 — "Generate payslips" is a pure export: it produces PDFs
// through the SOU-75 payslip channels but never mutates payout status.
// ---------------------------------------------------------------------------
test('Scenario 5 — generating payslips does not mutate payout status', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { month: MONTH, teachers: [KARIM] });
  const win = live.win;
  await gotoPayroll(win, L);
  await assertMounted(win, L);

  const row = win.getByRole('row', { name: new RegExp(KARIM.nameFr) });
  await expect(row).toContainText(L.status.draft);

  await win.getByRole('button', { name: L.generateButton }).click();
  await expect(win.getByText(L.payslipsGeneratedToast(1))).toBeVisible();

  await expect(row).toContainText(L.status.draft);
  await expect(row.getByRole('button', { name: L.rowConfirmAction })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 6 — Empty state: a month with no active payroll rule shows the
// dashboard's own empty state, not a blank or crashed screen.
// ---------------------------------------------------------------------------
test('Scenario 6 — a month with no active payroll rule shows the empty state', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { month: MONTH, teachers: [KARIM] });
  const win = live.win;
  await gotoPayroll(win, L);
  await assertMounted(win, L);

  await win.getByLabel(L.monthFilterLabel).fill('2026-01');
  await win.waitForTimeout(500);

  await expect(win.getByText(L.emptyState.title)).toBeVisible();
  await expect(win.getByText(L.emptyState.body)).toBeVisible();
  await win.screenshot({ path: shot('empty-month') });
});

// ---------------------------------------------------------------------------
// Scenario 7 — Per-teacher drill-down expands and renders the attribution
// panel end-to-end via `payroll.attributionBreakdown`, including its empty
// state when the teacher has no attributed fees that month. The attribution
// math itself is domain-policy territory (SOU-73), unit-tested there.
// ---------------------------------------------------------------------------
test('Scenario 7 — the drill-down expands to show the attribution panel and its empty state', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { month: MONTH, teachers: [SANAE] });
  const win = live.win;
  await gotoPayroll(win, L);
  await assertMounted(win, L);

  const row = win.getByRole('row', { name: new RegExp(SANAE.nameFr) });
  const toggle = row.getByRole('button', { name: L.drilldown.show });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();

  await expect(win.getByText(L.drilldown.title)).toBeVisible();
  await expect(win.getByText(L.drilldown.empty)).toBeVisible();
  await expect(row.getByRole('button', { name: L.drilldown.hide })).toHaveAttribute('aria-expanded', 'true');
  await win.screenshot({ path: shot('drilldown-empty') });
});

// ---------------------------------------------------------------------------
// Scenario 8 — AR/RTL sanity: the sidebar mirrors to the right, the page
// direction is `rtl`, and MAD amounts render with the Arabic currency
// suffix. Only meaningful under the `ar` project; guarded so it is a no-op
// under `fr`.
// ---------------------------------------------------------------------------
test('Scenario 8 — AR locale renders RTL with locale-correct MAD formatting', async () => {
  test.skip(locale() !== 'ar', 'AR/RTL-only assertion');
  const L = STR.ar;
  live = await boot('ar', { month: MONTH, teachers: [KARIM] });
  const win = live.win;
  await gotoPayroll(win, L);
  await assertMounted(win, L);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe('rtl');
  const row = win.getByRole('row', { name: new RegExp(KARIM.nameFr) });
  await expect(row).toContainText('د.م.');
  await win.screenshot({ path: shot('ar-rtl'), fullPage: true });
});
