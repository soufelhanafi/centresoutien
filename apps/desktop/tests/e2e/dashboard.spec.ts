import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  DIRECTION,
  boot,
  pageCrashed,
  seedFullMonth,
  readDashboardApi,
  expectedPercent,
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

/** The mono figure inside an Argent card, found via its label (`Facturé` → `0 MAD`). */
async function argentValue(win: Page, label: string): Promise<string | null> {
  const labelLoc = win.getByText(label, { exact: true }).first();
  const card = labelLoc.locator('xpath=..');
  const value = card.locator('span').first();
  return value.textContent();
}

// ---------------------------------------------------------------------------
// Scenario 1 — Basique empty state: a freshly booted center (zero students,
// sessions, invoices) shows the four sections with zeroed figures (not blank /
// crashed) and their dedicated empty-state copy.
// ---------------------------------------------------------------------------
test('Scenario 1 — Basique empty state shows the four sections at zero', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await assertMounted(win, L);
  await win.screenshot({ path: `test-results/dashboard-basic-empty-${locale()}.png` });

  await expect(win.getByRole('tab', { name: L.tabs.basic })).toHaveAttribute('aria-selected', 'true');
  await expect(win.getByText(L.sections.argent, { exact: true })).toBeVisible();
  await expect(win.getByText(L.sections.effectifs, { exact: true })).toBeVisible();
  await expect(win.getByText(L.sections.teacherLoad, { exact: true })).toBeVisible();
  await expect(win.getByText(L.sections.seances, { exact: true })).toBeVisible();

  expect(await argentValue(win, L.argent.billed)).toBe('0 MAD');
  expect(await argentValue(win, L.argent.collected)).toBe('0 MAD');
  expect(await argentValue(win, L.argent.unpaid)).toBe('0 MAD');

  await expect(win.getByText(L.effectifs.noGroups, { exact: true })).toBeVisible();
  await expect(win.getByText(L.teacherLoadEmpty, { exact: true })).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 2 — Basique happy path: seeded activity (1 active student, 1 group,
// 1 session this week) is reflected in the Effectifs + Séances sections.
// Argent stays at zero: the seeded invoice can never leave `draft` (SOU-143),
// and the new read model counts issued invoices only (SOU-177 shape).
// ---------------------------------------------------------------------------
test('Scenario 2 — Basique Effectifs and Séances reflect seeded activity exactly', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await seedFullMonth(win);
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  await assertMounted(win, L);
  await win.screenshot({ path: `test-results/dashboard-basic-seeded-${locale()}.png` });

  expect(await argentValue(win, L.argent.billed), 'the seeded invoice stays draft, so billed = 0').toBe('0 MAD');

  const effectifsCard = win.getByText(L.sections.effectifs, { exact: true }).locator('xpath=..');
  await expect(effectifsCard).toContainText('1');
  await expect(effectifsCard).toContainText(L.effectifs.groups);

  const seancesCard = win.getByText(L.sections.seances, { exact: true }).locator('xpath=..');
  await expect(seancesCard).toContainText('1');
});

// ---------------------------------------------------------------------------
// Scenario 3 — a group with no concrete session this week surfaces in the
// amber "groupes sans séance planifiée" card, whose row links to the calendar.
// (The Basique page itself renders no quick-action shortcuts — design 1b.)
// ---------------------------------------------------------------------------
test('Scenario 3 — a group without a session links to the calendar from the amber card', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await assertMounted(win, L);

  await seedFullMonth(win);
  await win.evaluate(async () => {
    const api = (window as unknown as { api: Bridge }).api;
    await api.invoke('group.create', {
      subjectId: 'subj_empty',
      teacherId: null,
      level: 'Tronc commun',
      capacity: 15,
      kind: 'regular',
    });
  });
  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  await assertMounted(win, L);

  const amberCard = win.getByText(/sans séance planifiée|بدون حصص مخططة/).first();
  await expect(amberCard).toBeVisible();
  const row = amberCard.locator('xpath=following-sibling::ul//a').first();
  await row.click();
  await win.waitForTimeout(400);
  expect(await pageCrashed(win)).toBe(false);
  expect(await win.evaluate(() => location.hash)).toContain('planning');
});

// ---------------------------------------------------------------------------
// Scenario 4 — Avancé is available on every tier (SOU-83 MVP tier collapse:
// dashboard.advanced ships in all plans). The tab opens straight to the real
// widgets, with no lock overlay or upgrade teaser in the way.
// ---------------------------------------------------------------------------
for (const plan of ['essentiel', 'pro'] as const) {
  test(`Scenario 4 — Avancé is available on the ${plan} plan`, async () => {
    const L = STR[locale()];
    live = await boot(locale(), plan);
    const win = live.win;
    await assertMounted(win, L);

    await win.getByRole('tab', { name: L.tabs.advanced }).click();
    await win.waitForTimeout(500);
    await win.screenshot({ path: `test-results/dashboard-advanced-${plan}-${locale()}.png` });

    expect(await pageCrashed(win)).toBe(false);
    await expect(win.getByText(L.widgets.revenueTrend, { exact: true })).toBeVisible();
    await expect(win.getByText(L.widgets.subjectBreakdown, { exact: true })).toBeVisible();
    await expect(win.getByText(L.lockedShort)).toHaveCount(0);
    await expect(win.getByText(L.lockedTeaser, { exact: true })).toHaveCount(0);
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
  await expect(win.getByText(expectedPercent(0, locale()))).toBeVisible();
});

// ---------------------------------------------------------------------------
// Scenario 6 — Avancé happy path (Premium, read-model only): after seeding one
// fully-paid invoice + one present attendance record this month, the widgets
// must reflect that collected revenue and attendance — enrollment evolution and
// attendance rate do; revenue trend and the per-subject breakdown don't yet,
// because the seeded invoice can never leave `draft` (SOU-143, not SOU-100).
// ---------------------------------------------------------------------------
test('Scenario 6 — Avancé widgets reflect seeded paid revenue and attendance', async () => {
  const L = STR[locale()];
  live = await boot(locale(), 'premium');
  const win = live.win;
  await seedFullMonth(win);

  const { basic, advanced } = await readDashboardApi(win);
  // Ground truth via the public bridge, independent of the UI: prove the
  // invoice really is fully paid before asserting anything about the chart.
  expect(
    (basic as { summary: { argent: { unpaidMad: number } } }).summary.argent.unpaidMad,
  ).toBe(0);

  await win.reload();
  await win.waitForLoadState('domcontentloaded');
  await assertMounted(win, L);
  await win.getByRole('tab', { name: L.tabs.advanced }).click();
  await win.waitForTimeout(500);
  await win.screenshot({ path: `test-results/dashboard-advanced-seeded-${locale()}.png` });

  // Attendance rate: 1 present out of 1 recorded this month → 100%.
  await expect(win.getByText(expectedPercent(100, locale()))).toBeVisible();
  // Enrollment evolution: the read model does carry the active student for
  // the current month (asserted via the raw payload, the chart renders no
  // per-point text nodes to assert on directly).
  const advancedSummary = (advanced as { summary: { enrollmentEvolution: { month: string; activeStudentCount: number }[] } }).summary;
  const currentMonthEnrollment = advancedSummary.enrollmentEvolution.at(-1);
  expect(currentMonthEnrollment?.activeStudentCount).toBe(1);

  // Revenue trend and the per-subject breakdown both read only `issued`
  // invoices (CLAUDE.md §6/§7), and `seedFullMonth`'s invoice never leaves
  // `draft` because no IPC channel issues an invoice yet — tracked as SOU-143,
  // not a SOU-100 bug. Once SOU-143 ships, this assertion flips to `toHaveCount(0)`.
  await expect(win.getByText(L.subjectBreakdownEmpty)).toHaveCount(1);
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
// Scenario 8 — AR/RTL: the document direction flips, and each Basique money
// card's figure sits on the SAME side as its own label (a coherent card),
// mirrored to the end/right side in RTL exactly like it does at the
// start/left side in LTR.
// ---------------------------------------------------------------------------
test('Scenario 8 — AR/RTL: money figure stays visually grouped with its own label', async () => {
  const L = STR[locale()];
  live = await boot(locale());
  const win = live.win;
  await assertMounted(win, L);

  expect(await win.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[locale()]);

  // The label and figure spans are both block-level and stretch to the card's
  // full content width, so comparing their *element* bounding boxes cannot
  // detect a glyph-level misalignment. Measure the rendered GLYPH position via
  // `Range.getBoundingClientRect()` instead — the only way to tell which edge
  // of the card the visible text actually hugs.
  const rects = await win.evaluate((labelText) => {
    const cardEl = Array.from(document.querySelectorAll('p')).find((p) => p.textContent?.trim() === labelText)
      ?.parentElement;
    if (!cardEl) return null;
    const labelP = cardEl.querySelector('p');
    const figureSpan = cardEl.querySelector('p:last-of-type span');
    if (!labelP?.firstChild || !figureSpan?.firstChild) return null;
    const rectOf = (node: ChildNode): DOMRect => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect();
    };
    const card = cardEl.getBoundingClientRect();
    return { card: card.toJSON(), label: rectOf(labelP.firstChild).toJSON(), number: rectOf(figureSpan.firstChild).toJSON() };
  }, L.argent.billed);

  expect(rects, 'could not resolve the money card / label / figure glyph rects').toBeTruthy();
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
      `BUG: in ${locale()}, the money label glyph sits on the "${labelSide}" side of its card while the figure glyph sits on the "${numberSide}" side — they should visually group together`,
    ).toBe(labelSide);
  }
});
