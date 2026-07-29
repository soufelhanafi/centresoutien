import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { MAIN_ENTRY, VALID_ADMIN, freshUserDataDir } from './wizard.fixtures';

const HEADING = { fr: 'Centre Soutien', ar: 'مركز الدعم' } as const;
const DIRECTION = { fr: 'ltr', ar: 'rtl' } as const;
const OTHER_LANG_LABEL = { fr: 'العربية', ar: 'Français' } as const;
type Locale = 'fr' | 'ar';

let app: ElectronApplication;

/**
 * Launch past the SOU-25 first-run gate. The gate renders the setup wizard
 * whenever no admin is persisted, so we seed one through the public preload
 * bridge (`admin.create`) and reload — `FirstRunGate` re-queries `admin.exists`,
 * gets `true`, and renders the smoke page. Black-box: bridge + UI only.
 */
async function launch(locale: string): Promise<Page> {
  app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${freshUserDataDir()}`],
    env: { ...process.env, CS_LOCALE: locale },
  });
  const window = await app.firstWindow();
  await window.evaluate(async (admin) => {
    const api = (window as unknown as {
      api: { invoke: (channel: string, request: unknown) => Promise<unknown> };
    }).api;
    await api.invoke('admin.create', admin);
  }, VALID_ADMIN);
  await window.reload();
  return window;
}

test.afterEach(async () => {
  await app?.close();
});

test('boots in the project locale with the correct direction', async () => {
  const locale = test.info().project.name as Locale;
  const window = await launch(locale);

  await expect(window.getByRole('heading', { name: HEADING[locale] })).toBeVisible();
  expect(await window.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[locale]);
  expect(await window.evaluate(() => document.documentElement.lang)).toBe(locale);
});

test('round-trips app.ping over the typed IPC bridge', async () => {
  const window = await launch(test.info().project.name);
  await expect(window.getByText(/pong: renderer/)).toBeVisible();
});

test('toggling language flips direction live', async () => {
  const locale = test.info().project.name as Locale;
  const other: Locale = locale === 'fr' ? 'ar' : 'fr';
  const window = await launch(locale);

  await expect(window.getByRole('heading', { name: HEADING[locale] })).toBeVisible();
  await window.getByRole('button', { name: OTHER_LANG_LABEL[locale] }).click();

  await expect(window.getByRole('heading', { name: HEADING[other] })).toBeVisible();
  expect(await window.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[other]);
});
