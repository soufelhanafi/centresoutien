import type {
  ConfirmTeacherPayout,
  ConfirmMonthlyPayrolls,
  ListTeacherPayouts,
  GetTeacherAttributionBreakdown,
  GetPayrollProjection,
  TeacherPayout,
  TeacherPayoutId,
  CenterCode,
  UserId,
} from '@centresoutien/domain';
import type { IpcHandlers } from '../../shared/ipc/contract';

export type ConfirmTeacherPayoutUseCase = Pick<ConfirmTeacherPayout, 'execute'>;
export type ConfirmMonthlyPayrollsUseCase = Pick<ConfirmMonthlyPayrolls, 'execute'>;
export type ListTeacherPayoutsUseCase = Pick<ListTeacherPayouts, 'execute'>;
export type GetTeacherAttributionBreakdownUseCase = Pick<GetTeacherAttributionBreakdown, 'execute'>;
export type GetPayrollProjectionUseCase = Pick<GetPayrollProjection, 'execute'>;

/**
 * Only the surface the payroll dashboard's list/confirm/drill-down channels
 * need. `currentUserId` (not the full `envelopeContext`) deliberately keeps
 * this deps type from redeclaring `envelopeContext` with a narrower return
 * type than `handlers.ts`'s own — intersecting two differently-shaped
 * function signatures under the same property name resolves to whichever
 * signature TypeScript picks first, which silently drops `deviceOrigin` for
 * every other handler in the same `HandlerDeps` intersection.
 */
export type PayrollHandlerDeps = {
  listTeacherPayouts: ListTeacherPayoutsUseCase;
  confirmTeacherPayout: ConfirmTeacherPayoutUseCase;
  confirmMonthlyPayrolls: ConfirmMonthlyPayrollsUseCase;
  getTeacherAttributionBreakdown: GetTeacherAttributionBreakdownUseCase;
  getPayrollProjection: GetPayrollProjectionUseCase;
  centerCode: () => CenterCode;
  currentUserId: () => UserId;
};

/** Project a TeacherPayout to its boundary DTO: envelope stripped, like every other view in `handlers.ts`. */
function toTeacherPayoutView(payout: TeacherPayout) {
  return {
    id: payout.id,
    teacherId: payout.teacherId,
    month: payout.month,
    ruleKind: payout.ruleKind,
    amountMad: payout.amountMad,
    baseAmountMad: payout.baseAmountMad,
    percentSnapshot: payout.percentSnapshot,
    status: payout.status,
    notes: payout.notes,
  };
}

/**
 * Payroll dashboard IPC handlers (SOU-76), split out of `handlers.ts` like
 * `payslip-handlers.ts`. Every channel here delegates to a `payroll.teacher`-gated
 * domain use case — `ListTeacherPayouts` and `GetTeacherAttributionBreakdown`
 * exist solely to put that gate in front of the read paths, mirroring
 * `confirmPayout`/`confirmMonthly`'s already-gated write paths. The
 * dashboard's "Generate payslips" bulk action needs no channel of its own —
 * the renderer calls the existing `payslip.export`/`payslip.print` once per
 * payout returned by `listPayouts`.
 */
export function createPayrollHandlers(
  deps: PayrollHandlerDeps,
): Pick<
  IpcHandlers,
  | 'payroll.listPayouts'
  | 'payroll.confirmPayout'
  | 'payroll.confirmMonthly'
  | 'payroll.attributionBreakdown'
  | 'payroll.projection'
> {
  return {
    'payroll.listPayouts': async (request) => {
      const payouts = await deps.listTeacherPayouts.execute({
        centerCode: deps.centerCode(),
        month: request.month,
      });
      return { payouts: payouts.map(toTeacherPayoutView) };
    },
    'payroll.confirmPayout': async (request) => {
      const payout = await deps.confirmTeacherPayout.execute({
        centerCode: deps.centerCode(),
        teacherPayoutId: request.teacherPayoutId as TeacherPayoutId,
        updatedBy: deps.currentUserId(),
      });
      return { payout: toTeacherPayoutView(payout) };
    },
    'payroll.confirmMonthly': async (request) => {
      return deps.confirmMonthlyPayrolls.execute({
        centerCode: deps.centerCode(),
        month: request.month,
        updatedBy: deps.currentUserId(),
      });
    },
    'payroll.attributionBreakdown': async (request) => {
      const byTeacher = await deps.getTeacherAttributionBreakdown.execute({
        centerCode: deps.centerCode(),
        month: request.month,
      });
      const breakdown = Array.from(byTeacher, ([teacherId, bySubject]) =>
        Array.from(bySubject, ([subjectId, amountMad]) => ({ teacherId, subjectId, amountMad })),
      ).flat();
      return { breakdown };
    },
    'payroll.projection': async (request) => {
      const { projections, projectedBreakdown } = await deps.getPayrollProjection.execute({
        centerCode: deps.centerCode(),
        month: request.month,
      });
      return {
        projections: projections.map((projection) => ({
          teacherId: projection.teacherId,
          ruleKind: projection.ruleKind,
          encaisseMad: projection.encaisseMad,
          projeteMad: projection.projeteMad,
          percentSnapshot: projection.percentSnapshot,
        })),
        projectedBreakdown: projectedBreakdown.map((row) => ({
          teacherId: row.teacherId,
          subjectId: row.subjectId,
          amountMad: row.amountMad,
        })),
      };
    },
  };
}
