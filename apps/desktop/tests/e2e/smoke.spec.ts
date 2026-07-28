import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

const dirname = fileURLToPath(new URL('.', import.meta.url));
const mainEntry = join(dirname, '../../out/main/index.js');

const HEADING = { fr: 'Centre Soutien', ar: 'مركز الدعم' } as const;
const DIRECTION = { fr: 'ltr', ar: 'rtl' } as const;
const OTHER_LANG_LABEL = { fr: 'العربية', ar: 'Français' } as const;
type Locale = 'fr' | 'ar';

let app: ElectronApplication;

async function launch(locale: string): Promise<Page> {
  app = await electron.launch({ args: [mainEntry], env: { ...process.env, CS_LOCALE: locale } });
  return app.firstWindow();
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
