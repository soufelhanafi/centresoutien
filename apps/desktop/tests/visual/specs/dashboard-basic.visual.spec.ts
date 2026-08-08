import { test, expect } from '@playwright/test';
import { bootMocks, ok, type MockTable } from '../support/mock-bridge';
import { THEME_DIRECTION_MATRIX, gotoScreen, matrixLabel } from '../support/visual-harness';

/**
 * Dashboard — Basique view (SOU-177), one of the four key screens chosen for
 * golden-image regression (see `tests/visual/README.md`): the app's landing
 * screen, on every plan, with numeric cards and enrollment bars — a good
 * baseline for typography, card, and badge tone regressions.
 */
const MOCKS: MockTable = {
  ...bootMocks(),
  'dashboard.basic': ok({
    summary: {
      argent: {
        month: '2026-07',
        billedMad: 4825000,
        collectedMad: 3980000,
        unpaidMad: 845000,
        paidInvoices: { paidCount: 97, totalCount: 112 },
        prevMonth: { billedMad: 4540000, collectedMad: 3790000, unpaidMad: 730000 },
        deltas: {
          billed: { deltaPercent: 6.2 },
          collected: { deltaPercent: 4.8 },
        },
      },
      effectifs: {
        activeStudentCount: 148,
        groupCount: 14,
        averageStudentsPerGroup: 10.6,
        unenrolledStudentCount: 7,
        groupBars: [
          {
            groupId: 'grp_1',
            groupName: { fr: 'Math 2Bac SM — A', ar: 'رياضيات 2 باك ع — أ' },
            kind: 'regular',
            enrolledCount: 14,
            capacity: 15,
          },
          {
            groupId: 'grp_2',
            groupName: { fr: 'Prépa Bac Math', ar: 'تحضير باك رياضيات' },
            kind: 'exam-prep',
            enrolledCount: 18,
            capacity: 18,
          },
          {
            groupId: 'grp_3',
            groupName: { fr: 'Français 2Bac', ar: 'فرنسية 2 باك' },
            kind: 'regular',
            enrolledCount: 7,
            capacity: 15,
          },
        ],
      },
      teacherWeeklyLoad: [
        { teacherId: 'tch_1', teacherName: { fr: 'M. Alaoui', ar: 'السيد العلوي' }, weeklyMinutes: 990 },
        { teacherId: 'tch_2', teacherName: { fr: 'Mme Benjelloun', ar: 'السيدة بنجلون' }, weeklyMinutes: 810 },
        { teacherId: 'tch_3', teacherName: { fr: 'M. Tazi', ar: 'السيد التازي' }, weeklyMinutes: 660 },
      ],
      seances: {
        weekStart: '2026-07-06',
        weekSessionCount: 42,
        plannedMinutes: 3210,
        groupsWithoutSessions: [
          { groupId: 'grp_4', groupName: { fr: 'Français 2Bac', ar: 'فرنسية 2 باك' }, kind: 'regular' },
          { groupId: 'grp_5', groupName: { fr: 'Anglais 1Bac', ar: 'إنجليزية 1 باك' }, kind: 'regular' },
        ],
      },
    },
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
