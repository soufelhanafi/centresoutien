import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { MAIN_ENTRY, VALID_ADMIN, freshUserDataDir, passAuthGate } from './wizard.fixtures';

// The app boots to the default route (/dashboard), so the page heading is the
// dashboard module title. Language toggle shows the OTHER language's label.
const HEADING = { fr: 'Tableau de bord', ar: 'لوحة القيادة' } as const;
const DIRECTION = { fr: 'ltr', ar: 'rtl' } as const;
const OTHER_LANG_LABEL = { fr: 'العربية', ar: 'Français' } as const;
type Locale = 'fr' | 'ar';

let app: ElectronApplication;

/**
 * Launch past the SOU-25 first-run gate and the SOU-27 auth gate into the app
 * shell (SOU-99). The gate renders the setup wizard whenever no admin is
 * persisted, so we seed one through the public preload bridge (`admin.create`);
 * `FirstRunGate` then re-queries `admin.exists`, gets `true`, and the shell
 * renders. Black-box: bridge + UI only.
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
  await passAuthGate(window);
  return window;
}

test.afterEach(async () => {
  await app?.close();
});

test('boots into the shell on the default route, in the project locale and direction', async () => {
  const locale = test.info().project.name as Locale;
  const window = await launch(locale);

  await expect(window.getByRole('heading', { level: 1, name: HEADING[locale] })).toBeVisible();
  await expect(window.getByRole('navigation')).toBeVisible();
  expect(await window.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[locale]);
  expect(await window.evaluate(() => document.documentElement.lang)).toBe(locale);
});

test('toggling language flips direction and the shell live', async () => {
  const locale = test.info().project.name as Locale;
  const other: Locale = locale === 'fr' ? 'ar' : 'fr';
  const window = await launch(locale);

  await expect(window.getByRole('heading', { level: 1, name: HEADING[locale] })).toBeVisible();
  await window.getByRole('button', { name: OTHER_LANG_LABEL[locale] }).click();

  await expect(window.getByRole('heading', { level: 1, name: HEADING[other] })).toBeVisible();
  expect(await window.evaluate(() => document.documentElement.dir)).toBe(DIRECTION[other]);
});
