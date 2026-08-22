import { test, expect } from '@playwright/test';
import {
  STR,
  boot,
  seedAttribution,
  fetchBreakdown,
  teacherTotal,
  cell,
  setAllocation,
  paymentSummary,
  gotoFormulas,
  gotoInvoices,
  pageCrashed,
  centimes,
  PACK,
  type Launched,
  type Locale,
} from './sou298-weighted-attribution.fixtures';

/**
 * SOU-298 — Weighted teacher fee attribution. Black-box, driven only through
 * the running packaged app + its public preload bridge (the same surface the
 * SOU-76 payroll suite drives for money-correctness edge cases).
 *
 * Money-correctness is the real business risk this ticket carries, so the
 * numeric criteria (1-5) are asserted straight off `payroll.attributionBreakdown`
 * / `invoice.setAllocation` / `payment.summary`. The two UI-shaped criteria (the
 * formula per-subject price form and the invoice allocation card) are additionally
 * driven through their real screens under both the FR-LTR and AR-RTL projects.
 *
 * Amounts on the wire are integer MAD centimes: 900 MAD = 90000, Math 440 = 44000,
 * equal-split third = 30000.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

function shot(name: string): string {
  return test.info().outputPath(`sou298-${name}-${test.info().project.name}.png`);
}

// ---------------------------------------------------------------------------
// Scenario 1 — Weighted attribution reads the Formula per-subject price map.
// Math-only teacher on the 900 pack (440/230/230) must be attributed 440, not
// the equal-split 300.
// ---------------------------------------------------------------------------
test('Scenario 1 — weighted split attributes Math against 440, not the equal-split 300', async () => {
  live = await boot(locale());
  const seed = await seedAttribution(live.win, { withPriceMap: true, collectMad: PACK.total });

  const rows = await fetchBreakdown(live.win, seed.month);
  const mathCell = cell(rows, seed.teachers.math, seed.subjects.math);

  expect(mathCell, 'Math teacher must have an attributed Math cell').not.toBeNull();
  expect(mathCell, `weighted base must be 440 MAD (44000c), got ${mathCell}`).toBe(centimes(PACK.math));
  expect(mathCell, 'weighted base must NOT be the equal-split 300 MAD (30000c)').not.toBe(centimes(300));
});

// ---------------------------------------------------------------------------
// Scenario 2 — Empty/legacy map → equal-split fallback (old behavior intact).
// ---------------------------------------------------------------------------
test('Scenario 2 — a formula with no price map falls back to the equal split (300)', async () => {
  live = await boot(locale());
  const seed = await seedAttribution(live.win, { withPriceMap: false, collectMad: PACK.total });

  const rows = await fetchBreakdown(live.win, seed.month);
  const mathCell = cell(rows, seed.teachers.math, seed.subjects.math);

  expect(mathCell, `equal split of 900/3 must be 300 MAD (30000c), got ${mathCell}`).toBe(centimes(300));
});

// ---------------------------------------------------------------------------
// Scenario 3 — Multi-subject teacher summation: the Math teacher also teaches
// FR, so they get 440 + 230 = 670.
// ---------------------------------------------------------------------------
test('Scenario 3 — a teacher of two subjects is attributed the sum of both weighted amounts (670)', async () => {
  live = await boot(locale());
  const seed = await seedAttribution(live.win, { withPriceMap: true, mathTeacherAlsoTeachesFr: true, collectMad: PACK.total });

  const rows = await fetchBreakdown(live.win, seed.month);
  const total = teacherTotal(rows, seed.teachers.math);

  expect(total, `Math+FR teacher total must be 670 MAD (67000c), got ${total}`).toBe(centimes(PACK.math + PACK.fr));
});

// ---------------------------------------------------------------------------
// Scenario 4 — Partial payment = Option A (pro-rate collected by price-map
// weight). 600 collected on the 900 pack → Math ≈ 600×440/900 = 293.33.
// ---------------------------------------------------------------------------
test('Scenario 4 — partial payment pro-rates the collected amount by weight (Math ≈ 293.33)', async () => {
  live = await boot(locale());
  const seed = await seedAttribution(live.win, { withPriceMap: true, collectMad: 600 });

  const summary = await paymentSummary(live.win, seed.invoiceId);
  expect(summary.netPaid, 'exactly 600 MAD collected').toBe(centimes(600));

  const rows = await fetchBreakdown(live.win, seed.month);
  const mathCell = cell(rows, seed.teachers.math, seed.subjects.math);

  // 60000c × 440/900 = 29333.33 → largest-remainder rounds to 29333 or 29334.
  expect(mathCell, `pro-rated Math base must be ≈ 293.33 MAD, got ${mathCell}`).toBeGreaterThanOrEqual(29333);
  expect(mathCell as number).toBeLessThanOrEqual(29334);
  // It must be the weighted pro-rate, NOT the equal-split pro-rate (60000/3 = 20000).
  expect(mathCell, 'must not be the equal-split partial 200 MAD (20000c)').not.toBe(centimes(200));
});

// ---------------------------------------------------------------------------
// Scenario 5 — Per-invoice manual allocation override: set + clear round-trip,
// attribution follows the manual weights, Payment ledger untouched.
// ---------------------------------------------------------------------------
test('Scenario 5 — manual per-invoice allocation overrides the weighting; clearing reverts; payments untouched', async () => {
  live = await boot(locale());
  const seed = await seedAttribution(live.win, { withPriceMap: true, collectMad: PACK.total });

  const before = await paymentSummary(live.win, seed.invoiceId);

  // Manual weights 100 / 400 / 400 (MAD) → Math fraction 100/900 of 900 collected = 100 MAD.
  await setAllocation(live.win, seed.invoiceId, [
    { subjectId: seed.subjects.math, amountMad: centimes(100) },
    { subjectId: seed.subjects.fr, amountMad: centimes(400) },
    { subjectId: seed.subjects.ar, amountMad: centimes(400) },
  ]);

  let rows = await fetchBreakdown(live.win, seed.month);
  expect(cell(rows, seed.teachers.math, seed.subjects.math), 'manual split → Math 100 MAD (10000c)').toBe(centimes(100));

  // Payments must be byte-for-byte untouched by an allocation write.
  const afterSet = await paymentSummary(live.win, seed.invoiceId);
  expect(afterSet.netPaid).toBe(before.netPaid);
  expect(afterSet.ledger.length).toBe(before.ledger.length);

  // Clearing (null) reverts to the weighted default (Math 440).
  await setAllocation(live.win, seed.invoiceId, null);
  rows = await fetchBreakdown(live.win, seed.month);
  expect(cell(rows, seed.teachers.math, seed.subjects.math), 'cleared → weighted Math 440 MAD (44000c)').toBe(centimes(PACK.math));

  const afterClear = await paymentSummary(live.win, seed.invoiceId);
  expect(afterClear.netPaid).toBe(before.netPaid);
  expect(afterClear.ledger.length).toBe(before.ledger.length);
});

// ---------------------------------------------------------------------------
// Scenario 5b — the allocation control exists on the invoice detail (gated by
// payroll.teacher) and opens without crashing. Runs the mechanism in-UI.
// ---------------------------------------------------------------------------
test('Scenario 5b — invoice detail exposes the allocation card and its configure control', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  await seedAttribution(live.win, { withPriceMap: true, collectMad: PACK.total });
  const win = live.win;

  await gotoInvoices(win, L);
  await win.getByRole('row').filter({ hasText: 'Yassine' }).first().getByRole('link').first().click();
  await win.waitForTimeout(500);
  expect(await pageCrashed(win), 'invoice detail rendered without the error boundary').toBe(false);

  await expect(win.getByText(L.allocation.title).first()).toBeVisible();
  await win.getByRole('button', { name: L.allocation.configure }).click();
  await expect(win.getByRole('button', { name: L.allocation.manualToggle }).or(win.getByText(L.allocation.manualToggle))).toBeVisible();
  await win.screenshot({ path: shot('allocation-card') });
});

// ---------------------------------------------------------------------------
// Scenario 6 — Formula CRUD exposes per-subject prices with live sum validation
// (mismatch blocked, each price > 0). Driven through the real create form.
// ---------------------------------------------------------------------------
test('Scenario 6 — formula form enters per-subject prices with live sum-equals-total validation', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;

  // A subject must exist before a formula can bundle it.
  await win.evaluate(async () => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }).api;
    await api.invoke('subject.create', { name: { fr: 'Mathématiques', ar: 'الرياضيات' }, code: 'MATH' });
    await api.invoke('subject.create', { name: { fr: 'Français', ar: 'الفرنسية' }, code: 'FR' });
  });
  await win.reload();
  await win.waitForLoadState('domcontentloaded');

  await gotoFormulas(win, L);
  await win.getByRole('button', { name: L.formula.newBtn }).first().click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await dialog.getByLabel(L.formula.nameFr).fill('Pack QA');
  await dialog.getByLabel(L.formula.price).fill('900');

  // Select both subjects (multi-select combobox — pick the two options).
  await dialog.getByLabel(L.formula.subjects).click();
  await win.getByRole('option', { name: 'Mathématiques' }).click();
  await win.getByRole('option', { name: 'Français' }).click();
  await win.keyboard.press('Escape');

  // Turn on the per-subject price split.
  await dialog.getByText(L.formula.perSubjectToggle).click();

  const priceInputs = dialog.getByRole('spinbutton');
  // Enter a deliberately mismatched split (500 + 300 = 800 ≠ 900) → must be flagged/blocked.
  await priceInputs.nth(1).fill('500');
  await priceInputs.nth(2).fill('300');
  await expect(dialog.getByText(L.formula.errSumMismatch)).toBeVisible();
  await expect(dialog.getByRole('button', { name: L.formula.create })).toBeDisabled();
  await win.screenshot({ path: shot('formula-sum-mismatch') });

  // Correct the split (440 + 460 = 900) → validation clears and create succeeds.
  await priceInputs.nth(1).fill('440');
  await priceInputs.nth(2).fill('460');
  await expect(dialog.getByText(L.formula.errSumMismatch)).toHaveCount(0);
  await dialog.getByRole('button', { name: L.formula.create }).click();
  await expect(win.getByText(L.formula.createSuccess)).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 6b — an immutable (already-billed) formula does not allow editing
// its per-subject prices. Uses seedAttribution to bill the formula (issuing an
// invoice line flips isImmutable), then opens edit.
// ---------------------------------------------------------------------------
test('Scenario 6b — an already-billed formula blocks per-subject price editing', async () => {
  live = await boot(locale());
  const seed = await seedAttribution(live.win, { withPriceMap: true, collectMad: PACK.total });
  const win = live.win;

  // The immutable formula edit path must reject changes with FormulaImmutableError.
  const err = await win.evaluate(async (formulaId) => {
    const api = (window as unknown as { api: { invoke: (c: string, r: unknown) => Promise<unknown> } }).api;
    try {
      await api.invoke('formula.update', {
        id: formulaId,
        name: { fr: 'Pack Math+FR+AR', ar: 'باقة' },
        subjectIds: [],
        priceMad: 90000,
        subjectPrices: [{ subjectId: 'sub_x', priceMad: 90000 }],
        kind: 'regular',
      });
      return null;
    } catch (e) {
      return String((e as { message?: string })?.message ?? e);
    }
  }, seed.formulaId);

  expect(err, 'editing a billed formula must be rejected, not silently accepted').not.toBeNull();
  expect(String(err)).toMatch(/immutable/i);
});

test('Scenario 7 — AR/RTL: the invoice detail allocation card renders right-to-left', async () => {
  test.skip(locale() !== 'ar', 'AR/RTL-only assertion');
  const L = STR.ar;
  live = await boot('ar');
  await seedAttribution(live.win, { withPriceMap: true, collectMad: PACK.total });
  const win = live.win;

  await gotoInvoices(win, L);
  await win.getByRole('row').filter({ hasText: 'ياسين' }).first().getByRole('link').first().click();
  await win.waitForTimeout(500);
  expect(await win.evaluate(() => document.documentElement.dir)).toBe('rtl');
  await expect(win.getByText(L.allocation.title).first()).toBeVisible();
  await win.screenshot({ path: shot('ar-allocation'), fullPage: true });
});
