import { test, expect, type Page } from '@playwright/test';
import { boot, DIRECTION, type Locale } from './app-shell.fixtures';

/**
 * SOU-216 — branded overlay scrollbars (OverlayScrollbars).
 *
 * The shell scroll regions must render an overlay scrollbar whose thumb is
 * branded (custom theme), floats over the content (no layout shift), and sits
 * on the correct edge under each direction: trailing edge in LTR (right),
 * leading edge in RTL (left) — Chromium flips native scrollbars, and the
 * overlay lib must do the same. Runs under both `fr` (LTR) and `ar` (RTL)
 * projects.
 *
 * Black-box: only the DOM the lib itself exposes is asserted — the
 * `os-scrollbar` structure and its CSS custom properties, never the lib
 * internals.
 */

const locale = () => test.info().project.name as Locale;

let live: Awaited<ReturnType<typeof boot>> | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

async function shellScrollbar(win: Page) {
  return win.evaluate(() => {
    const host = document.querySelector<HTMLElement>('#main-content [data-overlayscrollbars]');
    if (!host) return null;
    const scrollbar = host.querySelector<HTMLElement>('.os-scrollbar-vertical');
    if (!scrollbar) return null;
    const style = getComputedStyle(scrollbar);
    return {
      theme: scrollbar.getAttribute('class') ?? '',
      handleBg: style.getPropertyValue('--os-handle-bg').trim(),
      rect: scrollbar.getBoundingClientRect().toJSON(),
    };
  });
}

test('shell shows a branded overlay scrollbar on the trailing edge in LTR', async () => {
  const loc = locale();
  live = await boot(loc, 'pro');
  const win = live.win;

  // Force the shell to overflow so the vertical scrollbar actually renders.
  const bw = await live.app.browserWindow(win);
  await bw.evaluate((w: { setContentSize: (x: number, y: number) => void }) => w.setContentSize(1000, 400));

  await expect.poll(async () => shellScrollbar(win)).not.toBeNull();

  const sb = await shellScrollbar(win);
  expect(sb?.theme, 'thumb must use the custom brand theme').toContain('os-theme-centre-soutien');
  // The --scrollbar-thumb token is rgba(15, 118, 110, 0.35) → serialized as
  // the teal #0f766e at ~56% alpha. Assert the brand hue, not the exact string.
  expect(sb?.handleBg ?? '', 'thumb colour must come from the --scrollbar-* tokens').toMatch(
    /0f766e/,
  );

  // OverlayScrollbars flips the vertical scrollbar to the leading edge under
  // RTL via the `os-scrollbar-rtl` class — assert the flip marker, not geometry.
  if (DIRECTION[loc] === 'rtl') {
    expect(sb?.theme, 'vertical scrollbar must carry the RTL flip class').toContain('os-scrollbar-rtl');
  } else {
    expect(sb?.theme ?? '', 'LTR scrollbar must NOT carry the RTL flip class').not.toContain('os-scrollbar-rtl');
  }

  await win.screenshot({ path: `test-results/scrollbar-overlay-${loc}.png` });
});
