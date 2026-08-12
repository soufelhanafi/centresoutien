import { test, expect, type Page } from '@playwright/test';
import { boot, type Launched, type Locale } from './app-shell.fixtures';

/**
 * SOU-236 — abuse-case coverage for the Electron trust boundary, driven through
 * the running renderer (black-box). The packaged e2e build loads the renderer
 * from disk, so its own origin is `file:`; these specs prove a compromised
 * renderer cannot (a) navigate the trusted window off that origin, or (b) spawn
 * a popup to a foreign or dangerous URL. The sender/subframe half of the policy
 * is covered exhaustively at the unit level (renderer-origin, ipc-sender-guard).
 */

const locale = () => test.info().project.name as Locale;

let live: Launched | null = null;
test.afterEach(async () => {
  await live?.app.close();
  live = null;
});

const aliveSentinel = (win: Page) =>
  win.evaluate(() => (window as unknown as { __alive?: string }).__alive ?? 'gone');

test('blocks the main window navigating off its own origin', async () => {
  live = await boot(locale(), 'essentiel');
  const win = live.win;

  // A successful navigation replaces the document (wiping `__alive` and the
  // preload bridge); a blocked one leaves both intact. Polling the sentinel is
  // deterministic — no fixed sleep — and fails if the navigation ever commits.
  await win.evaluate(() => {
    (window as unknown as { __alive?: string }).__alive = 'yes';
    window.location.href = 'https://example.com/';
  });

  await expect.poll(() => aliveSentinel(win)).toBe('yes');
  expect(await win.evaluate(() => window.location.protocol)).toBe('file:');
  expect(await win.evaluate(() => typeof (window as unknown as { api?: unknown }).api)).toBe(
    'object',
  );
});

test('blocks the main window navigating to a foreign file: path (SOU-242 pin)', async () => {
  live = await boot(locale(), 'essentiel');
  const win = live.win;

  // The packaged renderer's own origin is `file:`, so a scheme-only trust check
  // would wave through any other local file. The path pin must block a redirect
  // to a foreign `file:` path just as it blocks an off-origin http(s) navigation.
  await win.evaluate(() => {
    (window as unknown as { __alive?: string }).__alive = 'yes';
    window.location.href = 'file:///etc/passwd';
  });

  await expect.poll(() => aliveSentinel(win)).toBe('yes');
  expect(await win.evaluate(() => window.location.pathname.endsWith('/index.html'))).toBe(true);
  expect(await win.evaluate(() => typeof (window as unknown as { api?: unknown }).api)).toBe(
    'object',
  );
});

test('denies a popup to a foreign host without opening an in-app window', async () => {
  live = await boot(locale(), 'essentiel');
  const win = live.win;
  const windowsBefore = live.app.windows().length;

  // setWindowOpenHandler denies synchronously, so window.open returns null and no
  // second BrowserWindow is created. A non-allowlisted host never reaches shell.openExternal.
  const opened = await win.evaluate(() => Boolean(window.open('https://example.com/', '_blank')));

  expect(opened).toBe(false);
  expect(live.app.windows().length).toBe(windowsBefore);
});

test('denies a popup to a dangerous scheme', async () => {
  live = await boot(locale(), 'essentiel');
  const win = live.win;
  const windowsBefore = live.app.windows().length;

  const opened = await win.evaluate(() => Boolean(window.open('file:///etc/passwd', '_blank')));

  expect(opened).toBe(false);
  expect(live.app.windows().length).toBe(windowsBefore);
});
