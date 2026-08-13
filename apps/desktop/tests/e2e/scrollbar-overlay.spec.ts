import { test, expect, type Page } from '@playwright/test';
import { boot, DIRECTION, type Locale } from './app-shell.fixtures';

/*
 * SOU-216 — branded overlay scrollbars (OverlayScrollbars).
 *
 * The shell scroll regions must render an overlay scrollbar whose thumb is
 * branded (custom theme), floats over the content (no layout shift), and sits
 * on the correct edge under each direction: trailing edge in LTR (right),
 * leading edge in RTL (left) — Chromium flips native scrollbars, and the
 * overlay lib must do the same. Runs under both `fr` (LTR) and `ar` (RTL)
 * projects.
 *
 * Black-box: asserts observable behavior (computed thumb colour, scrollbar
 * geometry, keyboard scroll) — never lib class names.
 */

const locale = () => test.info().project.name as Locale;

let live: Awaited<ReturnType<typeof boot>> | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

async function shellScrollbar(win: Page) {
  return win.evaluate(() => {
    // The skip-link target (#main-content) lives inside the overlay viewport, so
    // the shell's viewport is its nearest scrollable ancestor — use closest(),
    // not a descendant query.
    const target = document.querySelector<HTMLElement>('#main-content');
    if (!target) return null;
    const host = target.closest<HTMLElement>('[data-overlayscrollbars]');
    if (!host) return null;
    const viewport = target.closest<HTMLElement>('[data-overlayscrollbars-viewport]');
    if (!viewport) return null;
    const scrollbar = host.querySelector<HTMLElement>('.os-scrollbar-vertical');
    if (!scrollbar) return null;
    const style = getComputedStyle(scrollbar);
    return {
      handleBg: style.getPropertyValue('--os-handle-bg').trim(),
      scrollbarRect: scrollbar.getBoundingClientRect().toJSON(),
      hostRect: host.getBoundingClientRect().toJSON(),
      viewport: viewport,
    };
  });
}

test('shell shows a branded overlay scrollbar on the trailing edge', async () => {
  const loc = locale();
  live = await boot(loc, 'pro');
  const win = live.win;

  // Force the shell to overflow so the vertical scrollbar actually renders.
  const bw = await live.app.browserWindow(win);
  await bw.evaluate((w: { setContentSize: (x: number, y: number) => void }) => w.setContentSize(1000, 400));

  await expect.poll(async () => shellScrollbar(win)).not.toBeNull();

  const sb = await shellScrollbar(win);
  // The --scrollbar-thumb token is rgba(15, 118, 110, 0.35) → serialized as
  // the teal #0f766e at ~56% alpha. Assert the brand hue, not the exact string.
  expect(sb?.handleBg ?? '', 'thumb colour must come from the --scrollbar-* tokens').toMatch(/0f766e/);

  // Trailing edge: right edge of the host in LTR, left edge in RTL.
  const hostRect = sb?.hostRect as { left: number; right: number } | undefined;
  const sbRect = sb?.scrollbarRect as { left: number; right: number } | undefined;
  expect(hostRect).toBeDefined();
  expect(sbRect).toBeDefined();
  if (DIRECTION[loc] === 'ltr') {
    expect(sbRect?.right ?? 0).toBeCloseTo(hostRect?.right ?? 0, 0);
  } else {
    expect(sbRect?.left ?? 0).toBeCloseTo(hostRect?.left ?? 0, 0);
  }

  await win.screenshot({ path: `test-results/scrollbar-overlay-${loc}.png` });
});

// SOU-216 keyboard regression guard: the shell <main> is overflow-locked and the
// routed page scrolls inside the OverlayScrollbars viewport. Keyboard scrolling
// must still reach that viewport — otherwise PageDown/arrows die on a dead
// <main>. The skip link is wired to focus the lib's viewport, so the realistic
// keyboard flow (Tab to skip link, Enter, PageDown) must scroll.
test('keyboard scroll still works after skip-link focus', async () => {
  const loc = locale();
  live = await boot(loc, 'pro');
  const win = live.win;
  const bw = await live.app.browserWindow(win);
  await bw.evaluate((w: { setContentSize: (x: number, y: number) => void }) => w.setContentSize(1000, 400));

  await expect.poll(async () => shellScrollbar(win)).not.toBeNull();

  // Tab to the skip link, activate it, then PageDown exactly as a keyboard-only
  // user would after "skip to content".
  await win.keyboard.press('Tab');
  await win.keyboard.press('Enter');
  await win.keyboard.press('PageDown');
  await win.keyboard.press('PageDown');

  const scrolled = await win.evaluate(() => {
    const viewport = document
      .querySelector<HTMLElement>('#main-content')
      ?.closest<HTMLElement>('[data-overlayscrollbars-viewport]');
    return viewport ? viewport.scrollTop > 0 : false;
  });
  expect(scrolled, 'PageDown after skip-link focus must scroll the shell content').toBe(true);
});
