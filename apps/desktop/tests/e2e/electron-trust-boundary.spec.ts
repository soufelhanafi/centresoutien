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

async function attemptNavigation(win: Page, url: string): Promise<void> {
  await win.evaluate((target) => {
    window.location.href = target;
  }, url);
  await win.waitForTimeout(300);
}

test('blocks the main window navigating off its own origin', async () => {
  live = await boot(locale(), 'essentiel');
  const win = live.win;
  const originBefore = await win.evaluate(() => window.location.href);

  await attemptNavigation(win, 'https://example.com/');

  // will-navigate was vetoed: the renderer context survived and still sits on
  // the app's own file: origin — a foreign https page never loaded.
  expect(await win.evaluate(() => window.location.protocol)).toBe('file:');
  expect(await win.evaluate(() => window.location.href)).toBe(originBefore);
});

test('denies a popup to a foreign host without opening an in-app window', async () => {
  live = await boot(locale(), 'essentiel');
  const win = live.win;
  const windowsBefore = live.app.windows().length;

  const handle = await win.evaluate(() => Boolean(window.open('https://example.com/', '_blank')));
  await win.waitForTimeout(300);

  // setWindowOpenHandler denied it: window.open returns null and no second
  // BrowserWindow was created. A non-allowlisted host also never reaches shell.openExternal.
  expect(handle).toBe(false);
  expect(live.app.windows().length).toBe(windowsBefore);
});

test('denies a popup to a dangerous scheme', async () => {
  live = await boot(locale(), 'essentiel');
  const win = live.win;
  const windowsBefore = live.app.windows().length;

  const handle = await win.evaluate(() => Boolean(window.open('file:///etc/passwd', '_blank')));
  await win.waitForTimeout(300);

  expect(handle).toBe(false);
  expect(live.app.windows().length).toBe(windowsBefore);
});
