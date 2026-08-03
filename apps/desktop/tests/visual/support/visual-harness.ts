import type { Page } from '@playwright/test';
import { installMockBridge, type MockTable } from './mock-bridge';

export type Locale = 'fr' | 'ar';
export type ThemeMode = 'light' | 'dark';

export const DIRECTION: Record<Locale, 'ltr' | 'rtl'> = { fr: 'ltr', ar: 'rtl' };

/**
 * Mirrors `THEME_STORAGE_KEY` in `renderer/stores/theme-store.ts` — a plain,
 * stable localStorage key, not a type worth a runtime import across the
 * black-box boundary (existing e2e fixtures follow the same "mirror the
 * contract, don't import the implementation" convention for user-facing copy).
 */
const THEME_STORAGE_KEY = 'centre-soutien.theme';

/**
 * The theme x direction matrix (SOU-146): locale drives direction (`fr` = ltr,
 * `ar` = rtl, matching every other suite's `DIRECTION` map), and theme is
 * forced explicitly rather than left to `prefers-color-scheme` — CI has no
 * real display OS theme to toggle. `system` is intentionally excluded from
 * the matrix: it resolves to `light` or `dark` at runtime via
 * `matchMedia`, so testing it would only re-test whichever of the two
 * explicit modes the CI runner's default color scheme happens to report.
 */
export const THEME_DIRECTION_MATRIX: ReadonlyArray<{ theme: ThemeMode; locale: Locale }> = [
  { theme: 'light', locale: 'fr' },
  { theme: 'light', locale: 'ar' },
  { theme: 'dark', locale: 'fr' },
  { theme: 'dark', locale: 'ar' },
];

export function matrixLabel(entry: { theme: ThemeMode; locale: Locale }): string {
  return `${entry.theme}-${entry.locale}-${DIRECTION[entry.locale]}`;
}

async function seedTheme(page: Page, theme: ThemeMode): Promise<void> {
  await page.addInitScript(
    ({ storageKey, preference }: { storageKey: string; preference: ThemeMode }) => {
      window.localStorage.setItem(storageKey, JSON.stringify({ state: { preference }, version: 0 }));
    },
    { storageKey: THEME_STORAGE_KEY, preference: theme },
  );
}

/**
 * Boots a screen for a single point in the theme x direction matrix: seeds the
 * theme preference `public/theme-init.js` reads before mount, installs the
 * mocked IPC bridge, then navigates to the given hash route with `?locale=`
 * set (the renderer's only locale switch, read once in `i18n/config.ts`).
 */
export async function gotoScreen(
  page: Page,
  options: { theme: ThemeMode; locale: Locale; hashRoute: string; mocks: MockTable },
): Promise<void> {
  await seedTheme(page, options.theme);
  await installMockBridge(page, options.mocks);
  await page.goto(`/index.html?locale=${options.locale}#${options.hashRoute}`);
  await page.waitForLoadState('domcontentloaded');
}
