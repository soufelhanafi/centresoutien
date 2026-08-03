import { test, expect } from '@playwright/test';
import { bootMocks, ok, type MockTable } from '../support/mock-bridge';
import { THEME_DIRECTION_MATRIX, gotoScreen, matrixLabel } from '../support/visual-harness';

const STUDENT_NAME_FR = 'Salma Bennani';

/**
 * Student detail — Info tab (SOU-146 key screen): a form/detail surface with
 * a bilingual header, tab navigation, and a definition-list read view — the
 * archetype for every entity detail page in the app (teacher, group,
 * invoice…). `student.get` is mocked directly; the default tab (`info`)
 * renders from the same `student` prop with no further IPC round-trip, so
 * this is a fully static, deterministic screen.
 */
const MOCKS: MockTable = {
  ...bootMocks(),
  'student.get': ok({
    student: {
      id: 'stu_visual_demo',
      name: { fr: STUDENT_NAME_FR, ar: 'سلمى بناني' },
      birthDate: '2011-03-22',
      level: '2AC',
      school: 'Collège Al Massira',
      notes: 'Allergique aux arachides.',
      guardianIds: [],
      archived: false,
      createdAt: '2025-09-01T08:00:00.000Z',
    },
  }),
};

test.describe('student detail — info tab', () => {
  for (const entry of THEME_DIRECTION_MATRIX) {
    test(`renders — ${matrixLabel(entry)}`, async ({ page }) => {
      await gotoScreen(page, {
        theme: entry.theme,
        locale: entry.locale,
        hashRoute: '/students/stu_visual_demo',
        mocks: MOCKS,
      });

      await expect(page.getByRole('heading', { level: 1, name: STUDENT_NAME_FR })).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);

      await expect(page).toHaveScreenshot(`student-detail-${matrixLabel(entry)}.png`);
    });
  }
});
