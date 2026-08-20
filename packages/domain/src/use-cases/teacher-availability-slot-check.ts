import type { TeacherAvailabilityRepository } from '../ports/teacher-availability-repository';
import type { TeacherAvailabilityExceptionRepository } from '../ports/teacher-availability-exception-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import { toEntityId, type CenterCode, type EntityId } from '../value-objects/ids';
import type { DateRange } from '../value-objects/date-range';
import type { TeacherAvailability } from '../entities/teacher-availability';
import type { TeacherAvailabilityConflictContext } from '../policies/composite-session-conflicts';

/** The availability reads the manual create/edit paths share to gate one slot. */
export type TeacherAvailabilitySlotDeps = {
  readonly availability: TeacherAvailabilityRepository;
  readonly availabilityExceptions: TeacherAvailabilityExceptionRepository;
  readonly plan: PlanPolicy;
};

/**
 * Resolve the teacher-availability inputs the SOU-283 manual-path conflict check
 * reads for one candidate slot, or `undefined` when the check must be skipped.
 * Skipped — the teacher stays unrestricted — when the slot has no teacher, when
 * the plan lacks `planning.teacher-availability`, or when the teacher has NEITHER
 * a configured weekly row NOR an absence covering the slot's concrete occurrence
 * window. A row that EXISTS but is whole-week-empty is *not* skipped:
 * `weeklyWindows` comes back non-null so the policy flags every placement
 * out-of-window (the SOU-283 crux — explicit unavailability vs an unconfigured
 * teacher). `materializationRange` is the recurrence's concrete occurrence window
 * within the scheduling horizon, already intersected with its `validFrom`/
 * `validTo` (SOU-287); `null` means the recurrence has no occurrence in scope, so
 * exceptions are neither loaded nor checked — a one-off absence can never warn
 * about a date the recurrence never materializes on. The winning row is the
 * greatest id among a teacher's live rows, matching the
 * {@link TeacherAvailabilityRepository} projection contract.
 */
export async function loadTeacherAvailabilityForSlot(
  deps: TeacherAvailabilitySlotDeps,
  centerCode: CenterCode,
  teacherId: EntityId | null,
  materializationRange: DateRange | null,
): Promise<TeacherAvailabilityConflictContext | undefined> {
  if (teacherId === null) return undefined;
  if (!deps.plan.has('planning.teacher-availability')) return undefined;

  const rows = await deps.availability.listForCenter(centerCode);
  let row: TeacherAvailability | null = null;
  for (const candidate of rows) {
    if (toEntityId(candidate.teacherId) === teacherId) row = candidate;
  }

  const exceptionRows =
    materializationRange === null
      ? []
      : await deps.availabilityExceptions.listOverlapping(
          centerCode,
          materializationRange.start,
          materializationRange.end,
        );
  const exceptions = exceptionRows
    .filter((exception) => toEntityId(exception.teacherId) === teacherId)
    .map((exception) => exception.dateRange);

  if (row === null && exceptions.length === 0) return undefined;
  return {
    rules: { weeklyWindows: row?.weeklyWindows ?? null, exceptions },
    materializationRange,
  };
}
