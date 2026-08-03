import { test, expect } from '@playwright/test';
import { bootMocks, type MockTable } from '../support/mock-bridge';
import { THEME_DIRECTION_MATRIX, gotoScreen, matrixLabel, type Locale } from '../support/visual-harness';

/** Mirrors `settings.tabs.appearance` in `i18n/fr.json` / `ar.json`. */
const APPEARANCE_TAB_LABEL: Record<Locale, string> = { fr: 'Apparence', ar: 'المظهر' };

/**
 * Settings — Appearance tab (SOU-146 key screen): the screen that controls
 * the very toggle this suite's theme matrix exercises (SOU-144's dark-mode
 * switch), so a regression here would be the most on-the-nose failure this
 * harness could catch. No IPC beyond the shared boot channels — the
 * preference is device-local (`useThemeStore`, localStorage only).
 */
const MOCKS: MockTable = bootMocks();

test.describe('settings — appearance tab', () => {
  for (const entry of THEME_DIRECTION_MATRIX) {
    test(`renders — ${matrixLabel(entry)}`, async ({ page }) => {
      await gotoScreen(page, { theme: entry.theme, locale: entry.locale, hashRoute: '/settings', mocks: MOCKS });

      const tab = page.getByRole('tab', { name: APPEARANCE_TAB_LABEL[entry.locale] });
      await tab.click();
      await expect(page.getByRole('button', { pressed: true })).toBeVisible();

      await expect(page).toHaveScreenshot(`settings-appearance-${matrixLabel(entry)}.png`);
    });
  }
});
