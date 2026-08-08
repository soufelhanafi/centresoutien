import type {
  GetDashboardBasicSummary,
  GetDashboardAdvancedSummary,
  DashboardBasicSummary,
  DashboardAdvancedSummary,
  CenterCode,
} from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';

/** Project the read model to the IPC boundary DTO: `readonly` arrays widened to
 *  plain arrays, like every other view in `handlers.ts` — the shape is otherwise unchanged. */
function toDashboardBasicSummaryView(summary: DashboardBasicSummary) {
  return {
    argent: {
      month: summary.argent.month,
      billedMad: summary.argent.billedMad,
      collectedMad: summary.argent.collectedMad,
      unpaidMad: summary.argent.unpaidMad,
      paidInvoices: { ...summary.argent.paidInvoices },
      prevMonth: { ...summary.argent.prevMonth },
      deltas: {
        billed: { ...summary.argent.deltas.billed },
        collected: { ...summary.argent.deltas.collected },
      },
    },
    effectifs: {
      activeStudentCount: summary.effectifs.activeStudentCount,
      groupCount: summary.effectifs.groupCount,
      averageStudentsPerGroup: summary.effectifs.averageStudentsPerGroup,
      unenrolledStudentCount: summary.effectifs.unenrolledStudentCount,
      groupBars: summary.effectifs.groupBars.map((bar) => ({ ...bar, groupName: { ...bar.groupName } })),
    },
    teacherWeeklyLoad: summary.teacherWeeklyLoad.map((load) => ({
      ...load,
      teacherName: { ...load.teacherName },
    })),
    seances: {
      weekStart: summary.seances.weekStart,
      weekSessionCount: summary.seances.weekSessionCount,
      plannedMinutes: summary.seances.plannedMinutes,
      groupsWithoutSessions: summary.seances.groupsWithoutSessions.map((group) => ({
        ...group,
        groupName: { ...group.groupName },
      })),
    },
  };
}

/** Project the read model to the IPC boundary DTO: `readonly` arrays widened to
 *  plain arrays, like every other view in `handlers.ts` — the shape is otherwise unchanged. */
function toDashboardAdvancedSummaryView(summary: DashboardAdvancedSummary) {
  return {
    revenueTrend: summary.revenueTrend.map((point) => ({ ...point })),
    enrollmentEvolution: summary.enrollmentEvolution.map((point) => ({ ...point })),
    attendanceRatePercent: summary.attendanceRatePercent,
    subjectRevenueBreakdown: summary.subjectRevenueBreakdown.map((share) => ({
      subjectId: share.subjectId,
      subjectName: { fr: share.subjectName.fr, ar: share.subjectName.ar },
      amountMad: share.amountMad,
    })),
  };
}

export type GetDashboardBasicSummaryUseCase = Pick<GetDashboardBasicSummary, 'execute'>;
export type GetDashboardAdvancedSummaryUseCase = Pick<GetDashboardAdvancedSummary, 'execute'>;

/** Only the surface the dashboard read channels need. */
export type DashboardHandlerDeps = {
  getDashboardBasicSummary: GetDashboardBasicSummaryUseCase;
  getDashboardAdvancedSummary: GetDashboardAdvancedSummaryUseCase;
  centerCode: () => CenterCode;
};

/**
 * Dashboard read IPC handlers (SOU-100), split out like `invoice-handlers.ts` /
 * `payslip-handlers.ts`. Both channels are plain reads — no assembly step, no
 * side effects — so each is a one-line delegation to its pre-wired use case;
 * `dashboard.advanced` throwing `PlanFeatureUnavailableError` on a non-Premium
 * plan is handled by the shared IPC error mapping, not here.
 */
export function createDashboardHandlers(
  deps: DashboardHandlerDeps,
): Pick<IpcHandlers, 'dashboard.basic' | 'dashboard.advanced'> {
  return {
    'dashboard.basic': async () => {
      const summary = await deps.getDashboardBasicSummary.execute({ centerCode: deps.centerCode() });
      return { summary: toDashboardBasicSummaryView(summary) };
    },
    'dashboard.advanced': async () => {
      const summary = await deps.getDashboardAdvancedSummary.execute({ centerCode: deps.centerCode() });
      return { summary: toDashboardAdvancedSummaryView(summary) };
    },
  };
}
