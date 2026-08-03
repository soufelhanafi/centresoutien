import { test, expect } from '@playwright/test';
import { bootMocks, ok, type MockTable } from '../support/mock-bridge';
import { THEME_DIRECTION_MATRIX, gotoScreen, matrixLabel } from '../support/visual-harness';

/**
 * Dashboard — Basique view (SOU-100), one of the four key screens chosen for
 * golden-image regression (see `tests/visual/README.md`): the app's landing
 * screen, on every plan, with numeric KPI cards and no chart libraries — a
 * good baseline for typography, card, and badge tone regressions.
 */
const MOCKS: MockTable = {
  ...bootMocks(),
  'dashboard.basic': ok({
    summary: { todaysSessionCount: 4, activeStudentCount: 128, unpaidInvoiceCount: 6 },
  }),
};

test.describe('dashboard — basic view', () => {
  for (const entry of THEME_DIRECTION_MATRIX) {
    test(`renders — ${matrixLabel(entry)}`, async ({ page }) => {
      await gotoScreen(page, { theme: entry.theme, locale: entry.locale, hashRoute: '/dashboard', mocks: MOCKS });

      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);

      await expect(page).toHaveScreenshot(`dashboard-basic-${matrixLabel(entry)}.png`);
    });
  }
});
