import { test, expect, type Page } from '@playwright/test';
import { STR, boot, gotoTeachers, openPayrollTab, pageCrashed, type Launched, type Locale } from './teacher-payroll-rule.fixtures';

/**
 * SOU-72 — TeacherPayrollRule CRUD UI (discriminated by kind). Black-box,
 * driven only through the running packaged app. Runs under both the `fr`
 * (LTR) and `ar` (RTL) Playwright projects.
 *
 * Critical-only per SOU-142: kept scenarios cover both rule types this app
 * ever supports (`fixed-monthly`, `percentage-of-monthly-fees` — CLAUDE.md is
 * explicit that only these two exist) plus rule replacement (old rule moves
 * to History, new becomes Active) — this is money-correctness territory, a
 * regression here mispays a teacher. Validation, the same-month/next-month
 * History-period edge cases (domain policy correctness, not UI), Essentiel
 * plan-lock (the canonical plan-lock proof lives in app-shell.spec.ts), and
 * RTL are lower blast-radius and better covered at the unit/component level.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

const KARIM = { nameFr: 'Karim Idrissi', nameAr: 'كريم الإدريسي', phone: '0612345678' };

function shot(name: string): string {
  return test.info().outputPath(`sou72-${name}-${test.info().project.name}.png`);
}

async function assertMounted(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  expect(await pageCrashed(win), 'Teacher detail page rendered without the error boundary').toBe(false);
  await expect(win.getByRole('tab', { name: L.payrollTab })).toBeVisible();
}

// ---------------------------------------------------------------------------
// Scenario 1 — no rule yet: empty state, then create a fixed-monthly rule.
// ---------------------------------------------------------------------------
test('Scenario 1 — empty state, then create a fixed-monthly rule becomes Active', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { teachers: [KARIM] });
  const win = live.win;
  await gotoTeachers(win, L);
  await openPayrollTab(win, L, /Karim Idrissi/);
  await assertMounted(win, L);

  const panel = win.getByRole('tabpanel', { name: L.payrollTab });
  await expect(panel.getByText(L.active.emptyTitle)).toBeVisible();
  await expect(panel.getByText(L.active.emptyBody)).toBeVisible();
  await win.screenshot({ path: shot('empty-state') });

  await panel.getByRole('button', { name: L.active.emptyCta }).click();
  const dialog = win.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: L.form.createTitle })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: L.form.kind })).toContainText(L.kind.fixedMonthly);

  await dialog.getByRole('spinbutton', { name: L.form.amount }).fill('3000');
  await dialog.getByRole('button', { name: L.form.create }).click();

  await expect(win.getByText(L.form.createSuccess)).toBeVisible();
  await expect(panel.getByRole('heading', { name: L.active.title })).toBeVisible();
  await expect(panel).toContainText(L.kind.fixedMonthly);
  await expect(panel).toContainText('3');
  await expect(panel).toContainText('000');
  await expect(panel.getByText(L.active.fixedAmount)).toBeVisible();
  await win.screenshot({ path: shot('active-fixed') });
});

// ---------------------------------------------------------------------------
// Scenario 2 — no rule yet: create a percentage-of-monthly-fees rule.
// ---------------------------------------------------------------------------
test('Scenario 2 — empty state, then create a percentage rule becomes Active', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { teachers: [KARIM] });
  const win = live.win;
  await gotoTeachers(win, L);
  await openPayrollTab(win, L, /Karim Idrissi/);
  await assertMounted(win, L);

  const panel = win.getByRole('tabpanel', { name: L.payrollTab });
  await panel.getByRole('button', { name: L.active.emptyCta }).click();
  const dialog = win.getByRole('dialog');

  await dialog.getByRole('combobox', { name: L.form.kind }).click();
  await win.getByRole('option', { name: L.kind.percentageOfMonthlyFees }).click();
  await dialog.getByRole('spinbutton', { name: L.form.percent }).fill('30');
  await dialog.getByRole('button', { name: L.form.create }).click();

  await expect(win.getByText(L.form.createSuccess)).toBeVisible();
  await expect(panel.getByRole('heading', { name: L.active.title })).toBeVisible();
  await expect(panel).toContainText(L.kind.percentageOfMonthlyFees);
  await expect(panel).toContainText('30');
  await expect(panel.getByText(L.active.percentageAmount)).toBeVisible();
  await win.screenshot({ path: shot('active-percentage') });
});

// ---------------------------------------------------------------------------
// Scenario 3 — change rule: replaces the active rule; old should move to
// History, new should become Active. Uses the default (unmodified) "start
// month" field exposed by the change dialog.
// ---------------------------------------------------------------------------
test('Scenario 3 — change rule replaces the active rule; old moves to History, new becomes Active', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { teachers: [KARIM] });
  const win = live.win;
  await gotoTeachers(win, L);
  await openPayrollTab(win, L, /Karim Idrissi/);
  await assertMounted(win, L);

  const panel = win.getByRole('tabpanel', { name: L.payrollTab });
  await panel.getByRole('button', { name: L.active.emptyCta }).click();
  let dialog = win.getByRole('dialog');
  await dialog.getByRole('spinbutton', { name: L.form.amount }).fill('3000');
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expect(win.getByText(L.form.createSuccess)).toBeVisible();

  await panel.getByRole('button', { name: L.active.change }).click();
  dialog = win.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: L.form.changeTitle })).toBeVisible();
  await dialog.getByRole('combobox', { name: L.form.kind }).click();
  await win.getByRole('option', { name: L.kind.percentageOfMonthlyFees }).click();
  await dialog.getByRole('spinbutton', { name: L.form.percent }).fill('25');
  await dialog.getByRole('button', { name: L.form.save }).click();
  await expect(win.getByText(L.form.changeSuccess)).toBeVisible();
  await win.screenshot({ path: shot('after-change') });

  // The new rule (percentage, 25%) must be the one shown as Active…
  await expect(panel.getByRole('heading', { name: L.active.title })).toBeVisible();
  await expect(panel).toContainText(L.kind.percentageOfMonthlyFees);
  await expect(panel).toContainText('25');

  // …and the old rule (fixed, 3000 MAD) must have moved to History.
  const historyRegion = panel.getByRole('region', { name: L.history.title });
  await expect(historyRegion).not.toContainText(L.history.empty);
  const historyRow = historyRegion.getByRole('row').filter({ hasText: L.kind.fixedMonthly });
  await expect(historyRow).toBeVisible();
  await expect(historyRow).toContainText('3');
  await expect(historyRow).toContainText('000');
});
