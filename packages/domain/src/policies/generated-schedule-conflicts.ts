import { SessionConflictPolicy, type DayHours } from './session-conflict-policy';
import { teacherUnavailability, type TeacherAvailabilityRules } from './teacher-availability-policy';
import type {
  RoomConflictError,
  ScheduledSessionRef,
  SessionOutsideCenterHoursError,
  TeacherConflictError,
} from '../errors/scheduling-errors';
import type { TeacherUnavailableError } from '../errors/teacher-availability-errors';
import type { GroupId } from '../entities/group';
import type { RoomId } from '../entities/room';
import { toEntityId, type EntityId } from '../value-objects/ids';
import type { DateRange } from '../value-objects/date-range';
import type { TimeOfDay } from '../value-objects/time-of-day';
import type { WeekdayIndex } from '../value-objects/weekday';
import type { WeeklyBlock } from '../value-objects/weekly-block';

/** One generated block still awaiting conflict detection, tagged with its group. */
export type GeneratedBlockCandidate = {
  readonly groupId: GroupId;
  readonly block: WeeklyBlock;
  readonly roomId: RoomId;
  readonly teacherId: EntityId | null;
};

/**
 * A conflict surfaced against a generator run's own proposals (SOU-161) —
 * always non-blocking (a "warning" in the preview, never a thrown error): the
 * admin sees it and decides whether to adjust the config or accept it as-is.
 * Kept distinct from {@link SessionConflict} (composite-session-conflicts.ts),
 * which vetoes a single already-decided candidate at the point of manual
 * creation — this type instead reports across a whole batch of proposals.
 *
 * Both variants carry the offending block's `start`/`end` (SOU-183) so the
 * preview can attribute a conflict back to the single block that caused it —
 * `dayOfWeek` (and `roomId`) alone matched too coarsely and could falsely flag
 * a clean block sharing the same weekday.
 */
export type GeneratedScheduleConflict =
  | {
      readonly kind: 'room';
      readonly groupId: GroupId;
      readonly start: TimeOfDay;
      readonly end: TimeOfDay;
      readonly error: RoomConflictError;
    }
  | {
      readonly kind: 'hours';
      readonly groupId: GroupId;
      readonly start: TimeOfDay;
      readonly end: TimeOfDay;
      readonly error: SessionOutsideCenterHoursError;
    }
  | {
      readonly kind: 'teacher';
      readonly groupId: GroupId;
      readonly start: TimeOfDay;
      readonly end: TimeOfDay;
      readonly error: TeacherConflictError;
    }
  | {
      readonly kind: 'teacher-availability';
      readonly groupId: GroupId;
      readonly start: TimeOfDay;
      readonly end: TimeOfDay;
      readonly error: TeacherUnavailableError;
    };

/**
 * The availability inputs the detection pass reads when the SOU-259 feature is
 * active — `undefined` (flag off, or no teacher configured) skips the check
 * entirely. `rulesByTeacher` holds only teachers with something configured;
 * `rangeByWeekday` is the run's concrete materialization window per weekday
 * (the `occurrenceCount` range variant resolves to a different end date per
 * weekday), consumed by the exception check — a weekday absent from the map
 * skips exceptions for blocks on that day.
 */
export type GeneratorAvailabilityContext = {
  readonly rulesByTeacher: ReadonlyMap<EntityId, TeacherAvailabilityRules>;
  readonly rangeByWeekday: ReadonlyMap<WeekdayIndex, DateRange>;
};

/**
 * Checks every generated block for conflicts a generation run can silently
 * get wrong: a block that overruns the center's closing time on its weekday
 * (the engine anchors a block's `start` at a fitting window's `open` but, when no
 * single window is long enough, falls back to the first window and never revalidates
 * `end` against `close` — SOU-218), plus a room or teacher double-booked at an overlapping
 * weekday+time — either against the real, already-committed schedule
 * (`existingSchedule`) or against another group's proposal generated in this
 * same run (random room assignment has no way to know about a sibling
 * proposal's pick). Reuses {@link SessionConflictPolicy.withinCenterHours} and
 * {@link SessionConflictPolicy.roomConflict} so the underlying rules never
 * diverge from manual single-session creation. With an `availability` context
 * (SOU-259) it additionally flags blocks outside a teacher's declared weekly
 * windows or covered by a one-off absence — same non-blocking warning contract.
 * Pure — no I/O, no clock.
 */
export function detectGeneratedScheduleConflicts(
  candidates: readonly GeneratedBlockCandidate[],
  existingSchedule: readonly ScheduledSessionRef[],
  centerHours: readonly DayHours[],
  availability?: GeneratorAvailabilityContext,
): readonly GeneratedScheduleConflict[] {
  const conflicts: GeneratedScheduleConflict[] = [];

  candidates.forEach((candidate, index) => {
    const { start, end } = candidate.block;

    const hours = SessionConflictPolicy.withinCenterHours(candidate.block, centerHours);
    if (hours) conflicts.push({ kind: 'hours', groupId: candidate.groupId, start, end, error: hours });

    const siblings = candidates.filter((_, other) => other !== index).map(generatedCandidateToScheduledRef);
    const room = SessionConflictPolicy.roomConflict(
      { ...candidate.block, roomId: candidate.roomId },
      [...existingSchedule, ...siblings],
    );
    if (room) conflicts.push({ kind: 'room', groupId: candidate.groupId, start, end, error: room });

    if (candidate.teacherId !== null) {
      const teacher = SessionConflictPolicy.teacherConflict(
        { ...candidate.block, teacherId: candidate.teacherId },
        [...existingSchedule, ...siblings],
      );
      if (teacher) conflicts.push({ kind: 'teacher', groupId: candidate.groupId, start, end, error: teacher });

      const rules = availability?.rulesByTeacher.get(candidate.teacherId);
      if (rules !== undefined) {
        const range = availability?.rangeByWeekday.get(candidate.block.dayOfWeek) ?? null;
        const unavailable = teacherUnavailability(candidate.block, candidate.teacherId, rules, range);
        if (unavailable) {
          conflicts.push({ kind: 'teacher-availability', groupId: candidate.groupId, start, end, error: unavailable });
        }
      }
    }
  });

  return conflicts;
}

/**
 * Widens a generated block candidate into a {@link ScheduledSessionRef} so the
 * conflict checks can treat it exactly like an already-committed session — both
 * for sibling-vs-sibling detection inside one batch and for the generator's
 * per-candidate day search (SOU-182), where each committed group becomes a ref
 * the next group is checked against.
 */
export function generatedCandidateToScheduledRef(candidate: GeneratedBlockCandidate): ScheduledSessionRef {
  const ref: ScheduledSessionRef = {
    // Sibling proposals are not persisted yet; group id is the stable preview ref.
    id: toEntityId(candidate.groupId),
    roomId: candidate.roomId,
    dayOfWeek: candidate.block.dayOfWeek,
    start: candidate.block.start,
    end: candidate.block.end,
  };
  return candidate.teacherId === null ? ref : { ...ref, teacherId: candidate.teacherId };
}
