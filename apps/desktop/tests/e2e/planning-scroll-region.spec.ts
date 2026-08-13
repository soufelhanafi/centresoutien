import { test, expect, type Page } from '@playwright/test';
import {
  STR,
  bootWithHours,
  gotoPlanning,
  openWeek,
  type Launched,
  type Locale,
} from './planning-grid-bounds.fixtures';

/**
 * SOU-247 — the Planning page must present exactly ONE vertical scroll region:
 * the planner grid scrolls internally while the app-shell `<main>` does NOT, so
 * the fixed header/toolbar stays pinned. Black-box, runs under both the `fr`
 * (LTR) and `ar` (RTL) Playwright projects.
 *
 * Reproduces the "scroll within a scroll" condition deterministically: a wide
 * 08:00–22:00 hours week makes the grid body (14h) taller than the viewport at
 * the minimum supported window size (1280×800), so the grid MUST overflow. The
 * shell must absorb none of that overflow.
 *
 * Acceptance criteria:
 *   1. Exactly one vertical scrollbar — the grid scrolls, the shell does not.
 *   2. The grid scrolls internally (scrollHeight > clientHeight).
 *   3. The header/toolbar stays pinned while the grid content scrolls.
 *   4. Holds at 1280×800 and below.
 *   5. Holds in FR-LTR and AR-RTL.
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

/** Resize the window to an exact content size so the assertions run at a known viewport. */
async function setContentSize(app: Launched['app'], win: Page, width: number, height: number): Promise<void> {
  const bw = await app.browserWindow(win);
  await bw.evaluate(
    (w: { setContentSize: (x: number, y: number) => void }, size) => w.setContentSize(size.width, size.height),
    { width, height },
  );
}

type ScrollMetrics = {
  mainScrolls: boolean;
  gridScrolls: boolean;
  mainOverflow: number;
  gridOverflow: number;
};

/** Read the vertical scroll state of the shell `<main>` and the planner grid. */
async function scrollMetrics(win: Page): Promise<ScrollMetrics> {
  return win.evaluate(() => {
    const shell = document.querySelector<HTMLElement>('#main-content');
    if (!shell) throw new Error('missing #main-content shell');
    // OverlayScrollbars (SOU-216) wraps the real scrollable in a viewport
    // element; the host itself never scrolls. Measure the viewport inside the
    // grid's host, and confirm the shell's own overlay viewport has no overflow.
    const shellViewport = shell.querySelector<HTMLElement>('[data-overlayscrollbars-viewport]');
    const gridHost = shell.querySelector<HTMLElement>('.planner-grid-scroll');
    if (!gridHost) throw new Error('missing planner grid (#main-content .planner-grid-scroll)');
    const gridViewport = gridHost.querySelector<HTMLElement>('[data-overlayscrollbars-viewport]');
    if (!gridViewport) throw new Error('missing planner grid viewport');
    const overflow = (el: HTMLElement) => el.scrollHeight - el.clientHeight;
    const mainOverflow = shellViewport ? overflow(shellViewport) : 0;
    return {
      mainScrolls: mainOverflow > 1,
      gridScrolls: overflow(gridViewport) > 1,
      mainOverflow,
      gridOverflow: overflow(gridViewport),
    };
  });
}

/** Wait until the grid has rendered its full derived range (bottom hour label visible). */
async function waitForGrid(win: Page): Promise<void> {
  await expect(win.getByText('22:00', { exact: true }).first()).toBeVisible();
}

// ---------------------------------------------------------------------------
// AC1–AC2 — at the minimum supported size the grid overflows and scrolls, while
// the shell `<main>` shows no vertical scrollbar: exactly one scroll region.
// ---------------------------------------------------------------------------
test('planner grid is the only vertical scroll region at 1280×800', async () => {
  const L = STR[locale()];
  live = await bootWithHours(locale(), openWeek('08:00', '22:00'));
  const win = live.win;
  await setContentSize(live.app, win, 1280, 800);
  await gotoPlanning(win, L);
  await waitForGrid(win);

  const m = await scrollMetrics(win);
  expect(m.gridScrolls, `grid must scroll internally (overflow ${m.gridOverflow}px)`).toBe(true);
  expect(m.mainScrolls, `shell <main> must not scroll (overflow ${m.mainOverflow}px)`).toBe(false);

  await win.screenshot({ path: `test-results/planning-scroll-region-${locale()}.png` });
});

// ---------------------------------------------------------------------------
// AC3 — scrolling the grid moves only its own content; the page header (h1) and
// the toolbar stay pinned in place (they live outside the scroll region).
// ---------------------------------------------------------------------------
test('header and toolbar stay pinned while the grid scrolls', async () => {
  const L = STR[locale()];
  live = await bootWithHours(locale(), openWeek('08:00', '22:00'));
  const win = live.win;
  await setContentSize(live.app, win, 1280, 800);
  await gotoPlanning(win, L);
  await waitForGrid(win);

  const heading = win.getByRole('heading', { name: L.title });
  const before = await heading.boundingBox();

  const scrolledTo = await win.evaluate(() => {
    const gridHost = document.querySelector<HTMLElement>('#main-content .planner-grid-scroll');
    if (!gridHost) throw new Error('missing planner grid (#main-content .planner-grid-scroll)');
    const grid = gridHost.querySelector<HTMLElement>('[data-overlayscrollbars-viewport]');
    if (!grid) throw new Error('missing planner grid viewport');
    grid.scrollTop = 160;
    return grid.scrollTop;
  });
  expect(scrolledTo, 'the grid actually scrolled its own content').toBeGreaterThan(0);

  const after = await heading.boundingBox();
  expect(before?.y).toBeCloseTo(after?.y ?? -1, 0);

  const m = await scrollMetrics(win);
  expect(m.mainScrolls, `shell <main> must not scroll (overflow ${m.mainOverflow}px)`).toBe(false);
});

// ---------------------------------------------------------------------------
// AC4 — the invariant still holds below the minimum size: a shorter window only
// grows the grid's internal overflow; the shell still never scrolls.
// ---------------------------------------------------------------------------
test('shell never scrolls below the minimum window height (1280×560)', async () => {
  const L = STR[locale()];
  live = await bootWithHours(locale(), openWeek('08:00', '22:00'));
  const win = live.win;
  await setContentSize(live.app, win, 1280, 560);
  await gotoPlanning(win, L);
  await waitForGrid(win);

  const m = await scrollMetrics(win);
  expect(m.gridScrolls, `grid must scroll internally (overflow ${m.gridOverflow}px)`).toBe(true);
  expect(m.mainScrolls, `shell <main> must not scroll (overflow ${m.mainOverflow}px)`).toBe(false);
});
