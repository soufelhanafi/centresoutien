import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  DIRECTION,
  boot,
  gotoTeachers,
  openPayrollTab,
  pageCrashed,
  type Launched,
  type Locale,
} from './teacher-payroll-rule.fixtures';

/**
 * SOU-72 — TeacherPayrollRule CRUD UI (discriminated by kind). Black-box,
 * driven only through the running packaged app. Every spec runs under both
 * the `fr` (LTR) and `ar` (RTL) Playwright projects.
 *
 * Acceptance criteria under test: "admin sets a rule of either kind, sees it
 * applied on next payroll compute; historical rules remain visible."
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

// ---------------------------------------------------------------------------
// Scenario 3b — the closed rule's History period must be a sane, forward-in-
// time range (start <= end), never a range whose end predates its start.
// Regression probe for a bug found in manual exploration: replacing a rule
// via "change rule" while leaving the pre-filled "Mois d'effet" at the
// current month closes the old rule with `endMonth` one month BEFORE its own
// `startMonth` (both rules were created the same calendar month), rendering
// as e.g. "août 2026 – juillet 2026" in the History table.
// ---------------------------------------------------------------------------
test('Scenario 3b — History period for a same-month-replaced rule is not a backwards range', async () => {
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
  // Leave "Mois d'effet" at its own default (pre-filled by the form) — the
  // reproduction is specifically about NOT overriding it.
  await dialog.getByRole('spinbutton', { name: L.form.amount }).fill('5000');
  await dialog.getByRole('button', { name: L.form.save }).click();
  await expect(win.getByText(L.form.changeSuccess)).toBeVisible();
  await win.screenshot({ path: shot('history-period-same-month') });

  const historyRegion = panel.getByRole('region', { name: L.history.title });
  const historyRow = historyRegion.getByRole('row').filter({ hasText: '3' });
  const periodText = ((await historyRow.textContent()) ?? '').trim();
  await test.info().attach('history-period-text', { body: periodText });

  const monthIndex: Record<string, number> = {
    // FR
    janvier: 0, février: 1, mars: 2, avril: 3, mai: 4, juin: 5, juillet: 6, août: 7,
    septembre: 8, octobre: 9, novembre: 10, décembre: 11,
    // AR (Maghrebi month names as used by this app's Intl formatting)
    يناير: 0, فبراير: 1, مارس: 2, أبريل: 3, ماي: 4, يونيو: 5, يوليوز: 6, غشت: 7,
    شتنبر: 8, أكتوبر: 9, نونبر: 10, دجنبر: 11,
  };

  // Match every occurrence in reading order (not deduped by name) — a valid
  // single-month period repeats the same month name on both sides of the
  // dash (e.g. "août 2026 – août 2026"), which is legitimate: the old rule
  // was replaced by one starting the very next month, so it was active for
  // exactly that one month.
  const namePattern = new RegExp(Object.keys(monthIndex).join('|'), 'gu');
  const found = [...periodText.matchAll(namePattern)].map((m) => ({ name: m[0], idx: m.index }));

  expect(found.length, `History period text should name two months: "${periodText}"`).toBeGreaterThanOrEqual(2);
  const [startMonthName, endMonthName] = found;
  const startOrdinal = monthIndex[startMonthName!.name]!;
  const endOrdinal = monthIndex[endMonthName!.name]!;

  // Same calendar year in this reproduction (rule created and replaced the
  // same month "today"), so the end month must not be chronologically BEFORE
  // the start month within that period string. Equal months (a rule active
  // for exactly one month) is valid, not backwards.
  expect(
    endOrdinal,
    `History period "${periodText}" reads as ending (${endMonthName!.name}) before it starts (${startMonthName!.name}) — a backwards/invalid range.`,
  ).toBeGreaterThanOrEqual(startOrdinal);
});

// ---------------------------------------------------------------------------
// Scenario 3c — using "change rule" and explicitly setting the new rule's
// start month to NEXT month (as the feature's own copy promises: "opens a
// form to create its replacement (starting the next month)") must result in
// the new rule being discoverable as the teacher's current/forthcoming rule,
// and must NOT leave the OLD rule displayed under "Règle active" while the
// NEW rule is buried inside the "Historique" (past-rules) table.
// ---------------------------------------------------------------------------
test('Scenario 3c — changing the rule with a next-month start date does not strand the new rule in History', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { teachers: [KARIM] });
  const win = live.win;
  await gotoTeachers(win, L);
  await openPayrollTab(win, L, /Karim Idrissi/);
  await assertMounted(win, L);

  const panel = win.getByRole('tabpanel', { name: L.payrollTab });
  await panel.getByRole('button', { name: L.active.emptyCta }).click();
  let dialog = win.getByRole('dialog');
  await dialog.getByRole('combobox', { name: L.form.kind }).click();
  await win.getByRole('option', { name: L.kind.percentageOfMonthlyFees }).click();
  await dialog.getByRole('spinbutton', { name: L.form.percent }).fill('30');
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expect(win.getByText(L.form.createSuccess)).toBeVisible();

  await panel.getByRole('button', { name: L.active.change }).click();
  dialog = win.getByRole('dialog');
  const startMonthField = dialog.getByRole('textbox', { name: L.form.startMonth });
  const currentValue = await startMonthField.inputValue();
  const [yearStr, monthStr] = currentValue.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const nextMonthValue =
    month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  await startMonthField.fill(nextMonthValue);

  await dialog.getByRole('combobox', { name: L.form.kind }).click();
  await win.getByRole('option', { name: L.kind.fixedMonthly }).click();
  await dialog.getByRole('spinbutton', { name: L.form.amount }).fill('4500');
  await dialog.getByRole('button', { name: L.form.save }).click();
  await expect(win.getByText(L.form.changeSuccess)).toBeVisible();
  await win.screenshot({ path: shot('next-month-change') });

  // The newly defined fixed-monthly (4500) rule must be surfaced as the
  // teacher's current/forthcoming rule under "Règle active" — not silently
  // parked inside "Historique", which is documented as holding PAST rules.
  await expect(
    panel.getByRole('heading', { name: L.active.title }),
    'the Active section should reflect the just-defined replacement rule',
  ).toBeVisible();
  await expect(panel).toContainText(L.kind.fixedMonthly);
  await expect(panel).toContainText('4');
  await expect(panel).toContainText('500');

  const historyRegion = panel.getByRole('region', { name: L.history.title });
  await expect(
    historyRegion,
    'a rule with no endMonth (still open-ended) must never appear inside History',
  ).not.toContainText('4');
});

// ---------------------------------------------------------------------------
// Scenario 4 — validation: amount must be positive, percent must be 0<x<=100,
// inline errors (not a toast), no submission on invalid input.
// ---------------------------------------------------------------------------
test('Scenario 4 — invalid amount/percent show inline errors and do not submit', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { teachers: [KARIM] });
  const win = live.win;
  await gotoTeachers(win, L);
  await openPayrollTab(win, L, /Karim Idrissi/);
  await assertMounted(win, L);

  const panel = win.getByRole('tabpanel', { name: L.payrollTab });
  await panel.getByRole('button', { name: L.active.emptyCta }).click();
  const dialog = win.getByRole('dialog');

  // Empty submit — no amount entered.
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expect(dialog.getByRole('spinbutton', { name: L.form.amount })).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog).toBeVisible();

  // Negative amount.
  await dialog.getByRole('spinbutton', { name: L.form.amount }).fill('-50');
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expect(dialog.getByRole('spinbutton', { name: L.form.amount })).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog).toBeVisible();

  // Zero amount.
  await dialog.getByRole('spinbutton', { name: L.form.amount }).fill('0');
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expect(dialog.getByRole('spinbutton', { name: L.form.amount })).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog).toBeVisible();
  await win.screenshot({ path: shot('invalid-amount') });

  // No toast for a field-level validation error — this is inline-only.
  await expect(win.getByRole('status').filter({ hasText: /échoué|فشل/ })).toHaveCount(0);

  // Switch to percentage kind and probe its bounds.
  await dialog.getByRole('combobox', { name: L.form.kind }).click();
  await win.getByRole('option', { name: L.kind.percentageOfMonthlyFees }).click();

  await dialog.getByRole('spinbutton', { name: L.form.percent }).fill('0');
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expect(dialog.getByRole('spinbutton', { name: L.form.percent })).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog).toBeVisible();

  await dialog.getByRole('spinbutton', { name: L.form.percent }).fill('101');
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expect(dialog.getByRole('spinbutton', { name: L.form.percent })).toHaveAttribute('aria-invalid', 'true');
  await expect(dialog).toBeVisible();
  await win.screenshot({ path: shot('invalid-percent') });

  // A valid percent submits normally, proving the form was otherwise usable.
  await dialog.getByRole('spinbutton', { name: L.form.percent }).fill('50');
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expect(win.getByText(L.form.createSuccess)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 5 — plan gating: on Essentiel (no `payroll.teacher`), the Payroll
// tab is reachable but shows a locked upsell state instead of the CRUD form.
// ---------------------------------------------------------------------------
test('Scenario 5 — Essentiel plan shows the Payroll tab locked, not the CRUD form', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { plan: 'essentiel', teachers: [KARIM] });
  const win = live.win;
  await gotoTeachers(win, L);
  await win.getByRole('row', { name: /Karim Idrissi/ }).getByRole('link', { name: /Karim Idrissi/ }).first().click();
  await win.waitForTimeout(400);

  const payrollTab = win.getByRole('tab', { name: L.payrollTab });
  await expect(payrollTab).toBeVisible();
  await payrollTab.click();
  await win.waitForTimeout(300);

  const panel = win.getByRole('tabpanel', { name: L.payrollTab });
  await expect(panel.getByText(L.lockedBody)).toBeVisible();
  await expect(panel.getByRole('button', { name: L.active.emptyCta })).toHaveCount(0);
  await expect(panel.getByRole('spinbutton')).toHaveCount(0);
  await win.screenshot({ path: shot('locked-essentiel') });
});

// ---------------------------------------------------------------------------
// Scenario 6 — locale direction / RTL: same core create + change flow in AR,
// checking html dir and that the dialog and Active card mirror correctly.
// ---------------------------------------------------------------------------
test('Scenario 6 — locale direction and RTL rendering on the Payroll tab', async () => {
  const L = STR[locale()];
  live = await boot(locale(), { teachers: [KARIM] });
  const win = live.win;

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[locale()]);
  expect(await win.evaluate(() => document.documentElement.lang)).toBe(locale());

  await gotoTeachers(win, L);
  await openPayrollTab(win, L, /Karim Idrissi/);
  await assertMounted(win, L);

  const panel = win.getByRole('tabpanel', { name: L.payrollTab });
  await panel.getByRole('button', { name: L.active.emptyCta }).click();
  const dialog = win.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: L.form.createTitle })).toBeVisible();
  await dialog.getByRole('spinbutton', { name: L.form.amount }).fill('2500');
  await dialog.getByRole('button', { name: L.form.create }).click();
  await expect(win.getByText(L.form.createSuccess)).toBeVisible();

  const changeBtn = panel.getByRole('button', { name: L.active.change });
  const titleBox = (await panel.getByRole('heading', { name: L.active.title }).boundingBox())!;
  const changeBox = (await changeBtn.boundingBox())!;
  if (locale() === 'ar') {
    expect(changeBox.x, 'RTL: the change-rule action sits to the start (left) of the title').toBeLessThan(titleBox.x);
  } else {
    expect(changeBox.x, 'LTR: the change-rule action sits to the end (right) of the title').toBeGreaterThan(titleBox.x);
  }

  await win.screenshot({ path: shot('rtl-active') });
});
