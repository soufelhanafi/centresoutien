import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  DIRECTION,
  boot,
  pageCrashed,
  gotoDashboard,
  seedFullMonth,
  readDashboardApi,
  type Launched,
  type Locale,
} from './dashboard.fixtures';

/**
 * SOU-100 — Dashboard Basique + Avancé (KPIs and widgets). Black-box, driven
 * only through the running packaged app and the public preload bridge. Every
 * spec runs under both the `fr` (LTR) and `ar` (RTL) Playwright projects.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

async function assertMounted(win: Page, L: (typeof STR)[Locale]): Promise<void> {
  expect(await pageCrashed(win), 'Dashboard rendered without the "Something went wrong" error boundary').toBe(false);
  await expect(win.getByRole('heading', { level: 1, name: L.title })).toBeVisible();
}

async function kpiValue(win: Page, label: string): Promise<string | null> {
  const labelLoc = win.getByText(label, { exact: true }).first();
  const card = labelLoc.locator('xpath=..');
  const value = card.locator('span').first();
  return value.textContent();
}

// ---------------------------------------------------------------------------
// Scenario 1 — Basique empty state: a freshly booted center (zero students,
// sessions, invoices) shows the three KPI cards at 0 (not blank / crashed) and
// the three quick actions.
// ---------------------------------------------------------------------------
test('Scenario 1 — Basique empty state shows 0 KPIs and the three quick actions', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await assertMounted(win, L);
  await win.screenshot({ path: `test-results/dashboard-basic-empty-${locale()}.png` });

  await expect(win.getByRole('tab', { name: L.tabs.basic })).toHaveAttribute('aria-selected', 'true');
  expect(await kpiValue(win, L.kpis.todaysSessions)).toBe('0');
  expect(await kpiValue(win, L.kpis.activeStudents)).toBe('0');
  expect(await kpiValue(win, L.kpis.unpaidInvoices)).toBe('0');

  await expect(win.getByRole('link', { name: L.quickActions.addStudent })).toBeVisible();
  await expect(win.getByRole('link', { name: L.quickActions.recordPayment })).toBeVisible();
  await expect(win.getByRole('link', { name: L.quickActions.addSession })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 2 — Basique happy path: seeded activity (1 session today, 1 active
// student, 1 invoice fully paid) is reflected exactly in the three KPI cards.
// ---------------------------------------------------------------------------
test('Scenario 2 — Basique KPIs reflect seeded activity exactly', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await seedFullMonth(win);
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  await assertMounted(win, L);
  await win.screenshot({ path: `test-results/dashboard-basic-seeded-${locale()}.png` });

  expect(await kpiValue(win, L.kpis.todaysSessions)).toBe('1');
  expect(await kpiValue(win, L.kpis.activeStudents)).toBe('1');
  expect(await kpiValue(win, L.kpis.unpaidInvoices), 'the seeded invoice was recorded as fully paid').toBe('0');
});

// ---------------------------------------------------------------------------
// Scenario 3 — quick actions navigate to the right destination page and never
// crash the app.
// ---------------------------------------------------------------------------
test('Scenario 3 — quick actions navigate to Students / Invoicing / Planning', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await assertMounted(win, L);

  await win.getByRole('link', { name: L.quickActions.addStudent }).click();
  await win.waitForTimeout(400);
  expect(await pageCrashed(win)).toBe(false);
  expect(await win.evaluate(() => location.hash)).toContain('students');

  await gotoDashboard(win, L);
  await win.getByRole('link', { name: L.quickActions.recordPayment }).click();
  await win.waitForTimeout(400);
  expect(await pageCrashed(win)).toBe(false);
  expect(await win.evaluate(() => location.hash)).toContain('invoicing');

  await gotoDashboard(win, L);
  await win.getByRole('link', { name: L.quickActions.addSession }).click();
  await win.waitForTimeout(400);
  expect(await pageCrashed(win)).toBe(false);
  expect(await win.evaluate(() => location.hash)).toContain('planning');
});

// ---------------------------------------------------------------------------
// Scenario 4 — Avancé is locked on Essentiel and Pro (the flag is Premium-only):
// the tab shows a lock overlay with the "reserved for a higher plan" copy and a
// "view plans" affordance, and no chart/widget data is exposed underneath.
// ---------------------------------------------------------------------------
for (const plan of ['essentiel', 'pro'] as const) {
  test(`Scenario 4 — Avancé is locked on the ${plan} plan`, async () => {
    const L = STR[locale()];
    live = await boot(locale(), plan);
    const win = live.win;
    await assertMounted(win, L);

    await win.getByRole('tab', { name: L.tabs.advanced }).click();
    await win.waitForTimeout(500);
    await win.screenshot({ path: `test-results/dashboard-advanced-locked-${plan}-${locale()}.png` });

    await expect(win.getByText(L.tabs.advanced).last()).toBeVisible();
    await expect(win.getByText(L.lockedShort)).toBeVisible();
    expect(await pageCrashed(win)).toBe(false);

    // No REAL widget heading (exact match) leaks under the lock overlay — only
    // the generic teaser sentence (which happens to share a leading phrase with
    // the revenue-trend heading) is present, and it is marked inert/aria-hidden.
    await expect(win.getByText(L.widgets.revenueTrend, { exact: true })).toHaveCount(0);
    await expect(win.getByText(L.widgets.subjectBreakdown, { exact: true })).toHaveCount(0);
    await expect(win.getByText(L.lockedTeaser, { exact: true })).toBeVisible();
    const teaser = win.getByText(L.lockedTeaser, { exact: true }).locator('xpath=ancestor::div[@aria-hidden="true"][1]');
    await expect(teaser).toHaveAttribute('aria-hidden', 'true');
    await expect(teaser).toHaveAttribute('inert', '');
  });
}

// ---------------------------------------------------------------------------
// Scenario 5 — Avancé empty state on a fresh Premium center: the widgets
// render without crashing, attendance rate reads 0%, and the per-subject
// breakdown shows its dedicated empty-state copy (not a blank card).
// ---------------------------------------------------------------------------
test('Scenario 5 — Avancé empty state on a fresh Premium center', async () => {
  const L = STR[locale()];
  live = await boot(locale(), 'premium');
  const win = live.win;
  await assertMounted(win, L);

  await win.getByRole('tab', { name: L.tabs.advanced }).click();
  await win.waitForTimeout(500);
  await win.screenshot({ path: `test-results/dashboard-advanced-empty-${locale()}.png` });

  expect(await pageCrashed(win)).toBe(false);
  await expect(win.getByText(L.widgets.revenueTrend)).toBeVisible();
  await expect(win.getByText(L.widgets.enrollmentEvolution)).toBeVisible();
  await expect(win.getByText(L.widgets.attendanceRate)).toBeVisible();
  await expect(win.getByText(L.widgets.subjectBreakdown)).toBeVisible();
  await expect(win.getByText(L.subjectBreakdownEmpty)).toBeVisible();
  await expect(win.getByText('0%')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 6 — Avancé happy path (Premium, read-model only): after seeding one
// fully-paid invoice + one present attendance record this month, the widgets
// must reflect that collected revenue and attendance — enrollment evolution and
// attendance rate do; revenue trend and the per-subject breakdown do not
// (tracked as a FAIL / read-model bug below).
// ---------------------------------------------------------------------------
test('Scenario 6 — Avancé widgets reflect seeded paid revenue and attendance', async () => {
  const L = STR[locale()];
  live = await boot(locale(), 'premium');
  const win = live.win;
  await seedFullMonth(win);

  const { basic, advanced } = await readDashboardApi(win);
  // Ground truth via the public bridge, independent of the UI: prove the
  // invoice really is fully paid before asserting anything about the chart.
  expect((basic as { summary: { unpaidInvoiceCount: number } }).summary.unpaidInvoiceCount).toBe(0);

  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  await assertMounted(win, L);
  await win.getByRole('tab', { name: L.tabs.advanced }).click();
  await win.waitForTimeout(500);
  await win.screenshot({ path: `test-results/dashboard-advanced-seeded-${locale()}.png` });

  // Attendance rate: 1 present out of 1 recorded this month → 100%.
  await expect(win.getByText('100%')).toBeVisible();
  // Enrollment evolution: the read model does carry the active student for
  // the current month (asserted via the raw payload, the chart renders no
  // per-point text nodes to assert on directly).
  const advancedSummary = (advanced as { summary: { enrollmentEvolution: { month: string; activeStudentCount: number }[] } }).summary;
  const currentMonthEnrollment = advancedSummary.enrollmentEvolution.at(-1);
  expect(currentMonthEnrollment?.activeStudentCount).toBe(1);

  // KNOWN FAILURE (reported as a bug, not adjusted for): revenue trend and the
  // per-subject breakdown both still show zero/empty despite a fully-paid
  // 300 MAD invoice this month.
  await expect(
    win.getByText(L.subjectBreakdownEmpty),
    'BUG: subject revenue breakdown still shows "no revenue collected" despite a fully-paid invoice this month',
  ).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Scenario 7 — revenue trend chart tooltip must show a localized, formatted
// MAD amount, never a raw internal field name.
// ---------------------------------------------------------------------------
test('Scenario 7 — revenue trend tooltip never leaks a raw field name', async () => {
  const L = STR[locale()];
  live = await boot(locale(), 'premium');
  const win = live.win;
  await seedFullMonth(win);
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  await win.getByRole('tab', { name: L.tabs.advanced }).click();
  await win.waitForTimeout(500);

  const chart = win.locator('svg.recharts-surface').first();
  const box = await chart.boundingBox();
  expect(box, 'revenue trend chart did not render an svg surface').not.toBeNull();
  if (box) {
    await win.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
    await win.waitForTimeout(400);
    await win.screenshot({ path: `test-results/dashboard-advanced-tooltip-${locale()}.png` });
    const bodyText = await win.evaluate(() => document.body.innerText);
    expect(bodyText, 'BUG: the chart tooltip leaks the raw "collectedMad" DTO field name to the user').not.toContain(
      'collectedMad',
    );
  }
});

// ---------------------------------------------------------------------------
// Scenario 8 — AR/RTL: the document direction flips, and each Basique KPI
// card's number sits on the SAME side as its own label (a coherent card),
// mirrored to the end/right side in RTL exactly like it does at the
// start/left side in LTR.
// ---------------------------------------------------------------------------
test('Scenario 8 — AR/RTL: KPI number stays visually grouped with its own label', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await assertMounted(win, L);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[locale()]);

  // The label and number spans are both block-level and stretch to the card's
  // full content width, so comparing their *element* bounding boxes cannot
  // detect a glyph-level misalignment. Measure the rendered GLYPH position via
  // `Range.getBoundingClientRect()` instead — the only way to tell which edge
  // of the card the visible text actually hugs.
  const rects = await win.evaluate((labelText) => {
    const cardEl = Array.from(document.querySelectorAll('p')).find((p) => p.textContent?.trim() === labelText)
      ?.parentElement;
    if (!cardEl) return null;
    const labelP = cardEl.querySelector('p');
    const numberSpan = cardEl.querySelector('span');
    if (!labelP?.firstChild || !numberSpan?.firstChild) return null;
    const rectOf = (node: ChildNode): DOMRect => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect();
    };
    const card = cardEl.getBoundingClientRect();
    return { card: card.toJSON(), label: rectOf(labelP.firstChild).toJSON(), number: rectOf(numberSpan.firstChild).toJSON() };
  }, L.kpis.todaysSessions);

  expect(rects, 'could not resolve the KPI card / label / number glyph rects').toBeTruthy();
  if (rects) {
    const side = (box: { x: number; width: number }): 'left' | 'right' => {
      const distToRight = rects.card.x + rects.card.width - (box.x + box.width);
      const distToLeft = box.x - rects.card.x;
      return distToRight < distToLeft ? 'right' : 'left';
    };
    const labelSide = side(rects.label);
    const numberSide = side(rects.number);
    await win.screenshot({ path: `test-results/dashboard-rtl-kpi-alignment-${locale()}.png` });
    expect(
      numberSide,
      `BUG: in ${locale()}, the KPI label glyph sits on the "${labelSide}" side of its card while the number glyph sits on the "${numberSide}" side — they should visually group together`,
    ).toBe(labelSide);
  }
});
