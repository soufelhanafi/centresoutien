import { test, expect } from '@playwright/test';
import {
  STR,
  bootWithHours,
  closedSundayWeek,
  closedWeek,
  dayColumns,
  gotoPlanning,
  gridRoot,
  gutterEdges,
  hourLabels,
  openWeek,
  readWeekHours,
  ticketWeek,
  type Launched,
  type Locale,
} from './planning-grid-bounds.fixtures';

/**
 * SOU-184 — the weekly planner grid's vertical bounds derive from CenterHours
 * (union of open days), not a hard-coded window. Black-box, runs under both the
 * `fr` (LTR) and `ar` (RTL) Playwright projects.
 *
 * Acceptance criteria:
 *   1. start = earliest opening time, end = latest closing time across OPEN days
 *      (closed days excluded). Ticket example: Sunday 10:00–18:00, other days
 *      19:00–22:00 → grid gutter shows 10:00 top, 22:00 bottom.
 *   2. Closed days still render as a column, hatched and non-interactive
 *      (observable: `aria-hidden="true"`, `pointer-events: none`, 45° hatch).
 *   3. No day open → fallback 08:00–20:00.
 *
 * Hours are seeded through the same public `centerHours.save` channel the
 * Settings form persists through; nothing is reached into implementation.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

// ---------------------------------------------------------------------------
// AC1 (ticket scenario) — Sunday 10:00–18:00, others 19:00–22:00 → the gutter
// spans 10:00 (top) to 22:00 (bottom), and nothing outside the range renders.
// In AR the same labels render and the document direction is `rtl`.
// ---------------------------------------------------------------------------
test('grid bounds derive from CenterHours union (10:00 top → 22:00 bottom)', async () => {
  const L = STR[locale()];
  live = await bootWithHours(locale(), ticketWeek());
  const win = live.win;

  // Seed proof — the week persisted as saved.
  expect(await readWeekHours(win)).toEqual(ticketWeek());

  await gotoPlanning(win, L);

  // Document direction matches the locale (LTR for fr, RTL for ar).
  await expect(win.locator('html')).toHaveAttribute('dir', L.dir);

  const expected = hourLabels(10, 22);
  // Wait for the full derived range to render (data loaded, not the transient
  // default).
  await expect(win.getByText('22:00', { exact: true }).first()).toBeVisible();
  for (const label of expected) {
    await expect(win.getByText(label, { exact: true }).first()).toBeVisible();
  }

  // Nothing outside the union renders.
  await expect(win.getByText('09:00', { exact: true })).toHaveCount(0);
  await expect(win.getByText('23:00', { exact: true })).toHaveCount(0);

  // The top of the gutter is 10:00, the bottom is 22:00.
  const { top, bottom } = await gutterEdges(win, expected);
  expect(top).toBe('10:00');
  expect(bottom).toBe('22:00');

  await win.screenshot({ path: `test-results/planning-grid-bounds-ticket-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// AC2 — with Sunday closed, that day's column still renders but as a hatched,
// non-interactive column (`aria-hidden="true"`, `pointer-events: none`, 45°
// hatch); the other six open columns remain interactive and unmarked.
// ---------------------------------------------------------------------------
test('closed day renders hatched and non-interactive; open days unaffected', async () => {
  const L = STR[locale()];
  live = await bootWithHours(locale(), closedSundayWeek());
  const win = live.win;
  await gotoPlanning(win, L);

  // The closed day still participates in the bounds (union of OPEN days): here
  // every open day is 19:00–22:00, so the gutter starts at 19:00, not 10:00.
  await expect(win.getByText('19:00', { exact: true }).first()).toBeVisible();

  const cols = dayColumns(win, '19:00');
  await expect(cols).toHaveCount(7);

  // Sunday (first column) is closed: aria-hidden, non-interactive, hatched.
  await expect(cols.nth(0)).toHaveAttribute('aria-hidden', 'true');
  await expect(cols.nth(0)).toHaveCSS('pointer-events', 'none');
  const hatch = await cols.nth(0).evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(hatch).toContain('45deg');

  // The other six columns are open: no aria-hidden, default pointer-events.
  for (let i = 1; i < 7; i++) {
    await expect(cols.nth(i)).not.toHaveAttribute('aria-hidden', 'true');
    await expect(cols.nth(i)).toHaveCSS('pointer-events', 'auto');
    const bg = await cols.nth(i).evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bg).not.toContain('45deg');
  }

  // Only one closed column in the whole grid.
  const grid = gridRoot(win, '19:00');
  await expect(grid.locator(':scope > div[aria-hidden="true"]')).toHaveCount(1);
});

// ---------------------------------------------------------------------------
// AC3 — every day closed → grid falls back to the 08:00–20:00 window (08:00
// top, 20:00 bottom) and every column is closed.
// ---------------------------------------------------------------------------
test('all days closed → fallback window 08:00 top → 20:00 bottom', async () => {
  const L = STR[locale()];
  live = await bootWithHours(locale(), closedWeek());
  const win = live.win;

  expect(await readWeekHours(win)).toEqual(closedWeek());

  await gotoPlanning(win, L);

  const expected = hourLabels(8, 20);
  await expect(win.getByText('20:00', { exact: true }).first()).toBeVisible();
  for (const label of expected) {
    await expect(win.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(win.getByText('07:00', { exact: true })).toHaveCount(0);
  await expect(win.getByText('21:00', { exact: true })).toHaveCount(0);

  const { top, bottom } = await gutterEdges(win, expected);
  expect(top).toBe('08:00');
  expect(bottom).toBe('20:00');

  // Every column is closed.
  const cols = dayColumns(win, '08:00');
  await expect(cols).toHaveCount(7);
  for (let i = 0; i < 7; i++) {
    await expect(cols.nth(i)).toHaveAttribute('aria-hidden', 'true');
  }
});

// ---------------------------------------------------------------------------
// Sanity — a uniform open week (all days 19:00–22:00) yields a 19:00–22:00
// gutter: a narrower-than-default window is not padded back to defaults.
// ---------------------------------------------------------------------------
test('uniform open week keeps a tight gutter (19:00 top → 22:00 bottom)', async () => {
  const L = STR[locale()];
  live = await bootWithHours(locale(), openWeek('19:00', '22:00'));
  const win = live.win;
  await gotoPlanning(win, L);

  const expected = hourLabels(19, 22);
  await expect(win.getByText('22:00', { exact: true }).first()).toBeVisible();
  for (const label of expected) {
    await expect(win.getByText(label, { exact: true }).first()).toBeVisible();
  }
  // No padding back to 08:00/20:00 defaults.
  await expect(win.getByText('18:00', { exact: true })).toHaveCount(0);
  await expect(win.getByText('23:00', { exact: true })).toHaveCount(0);

  const { top, bottom } = await gutterEdges(win, expected);
  expect(top).toBe('19:00');
  expect(bottom).toBe('22:00');
});
