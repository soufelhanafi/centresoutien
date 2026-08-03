import { test, expect } from '@playwright/test';
import { bootMocks, fails, type MockTable } from '../support/mock-bridge';
import { THEME_DIRECTION_MATRIX, gotoScreen, matrixLabel } from '../support/visual-harness';

/**
 * Students list — load-error state (SOU-146 key screen): the shared
 * `ErrorState` component (`@centresoutien/ui`) as rendered by
 * `StudentListContent`, forced by rejecting `student.list` at the mocked IPC
 * boundary. `ErrorState` backs every list screen in the app (teachers,
 * parents, subjects, formulas, groups, rooms, invoices, payroll — see
 * `tests/visual/README.md`), so one golden image here is a proxy for all of
 * them; only the icon and copy change per screen, and those are exercised by
 * the functional suite's per-page load-error unit/renderer tests, not here.
 */
const MOCKS: MockTable = {
  ...bootMocks(),
  'student.list': fails('visual harness: simulated student.list failure'),
};

test.describe('students list — load error', () => {
  for (const entry of THEME_DIRECTION_MATRIX) {
    test(`renders — ${matrixLabel(entry)}`, async ({ page }) => {
      await gotoScreen(page, { theme: entry.theme, locale: entry.locale, hashRoute: '/students', mocks: MOCKS });

      await expect(page.getByRole('alert')).toBeVisible();

      await expect(page).toHaveScreenshot(`students-list-error-${matrixLabel(entry)}.png`);
    });
  }
});
