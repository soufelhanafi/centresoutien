import { DomainError } from './plan-errors';
import type { WeekdayIndex } from '../value-objects/weekday';
import type { GroupId } from '../entities/group';
import type { RoomId } from '../entities/room';

/** Why the auto-generator cannot satisfy the requested weekly pattern. */
export type InfeasibleGeneratorReason =
  | 'non-positive-sessions-per-week' // asked for zero (or fewer) sessions a week
  | 'pool-smaller-than-sessions' // fewer eligible weekdays than sessions requested
  | 'gap-unsatisfiable' // no placement of the sessions keeps every pair ≥ minGapDays apart
  | 'room-capacity-exceeded' // groups × sessionsPerWeek outgrows eligibleDays × rooms (SOU-261)
  | 'duration-exceeds-windows'; // no opening window on any eligible day fits sessionDurationMinutes (SOU-261)

/**
 * Thrown by the auto mode of the session generator (SOU-158) when no set of
 * `sessionsPerWeek` weekdays drawn from the eligible pool can honor the
 * `minGapDays` minimum-gap constraint — e.g. 3 sessions a week with a 3-day gap
 * (needs 9 days of spread in a 7-day week), or a pool left with too few open
 * days after closed weekdays are excluded. The eligible pool passed here is the
 * *effective* one (`weekdayPool` minus days the center is closed), so the
 * renderer can show exactly which days were actually available. Carries the
 * stable `infeasible-generator-config` code for `t(\`errors.${code}\`)`; the
 * domain stays i18n-agnostic. Custom mode never throws this — its gap breaches
 * are flagged, not blocked.
 */
export class InfeasibleGeneratorConfigError extends DomainError {
  readonly code = 'infeasible-generator-config';

  constructor(
    readonly reason: InfeasibleGeneratorReason,
    readonly eligibleWeekdays: readonly WeekdayIndex[],
    readonly sessionsPerWeek: number,
    readonly minGapDays: number,
  ) {
    super(
      `Cannot place ${sessionsPerWeek} session(s)/week with a ${minGapDays}-day gap ` +
        `across weekdays [${eligibleWeekdays.join(', ')}] (${reason}).`,
    );
  }
}

/**
 * Thrown by the session generator (SOU-158) when it needs to assign a room to
 * at least one generated block but was given an empty room pool. Every
 * `WeeklyRecurringSession` requires a `roomId`, so a center with zero rooms
 * configured cannot receive a generated plan until at least one room exists.
 * Carries the stable `no-rooms-configured` code for `t(\`errors.${code}\`)`.
 */
export class NoRoomsConfiguredError extends DomainError {
  readonly code = 'no-rooms-configured';

  constructor() {
    super('Cannot assign rooms to the generated plan: no rooms are configured for this center.');
  }
}

/**
 * Thrown by the auto session-generator (SOU-272) when a scoped group needs more
 * seats than the largest configured room can hold — no room assignment could
 * ever satisfy the seat-fit invariant {@link GroupOverCapacityError} enforces at
 * commit, so the run is infeasible as configured. Kept distinct from
 * {@link InfeasibleGeneratorConfigError}, whose reasons all advise reordering
 * days/gaps: this one carries its own stable `group-exceeds-room-capacity` code
 * so the renderer surfaces the right remediation ("add a larger room or shrink
 * the group") via `t(\`errors.${code}\`)` instead of the gap advice. Surfacing it
 * on the preview beats a mid-commit crash.
 */
export class GroupExceedsRoomCapacityError extends DomainError {
  readonly code = 'group-exceeds-room-capacity';

  constructor(
    readonly groupCapacity: number,
    readonly largestRoomCapacity: number,
  ) {
    super(
      `A group needs ${groupCapacity} seats but the largest room holds only ${largestRoomCapacity}.`,
    );
  }
}

/**
 * Thrown by {@link CommitGeneratedSchedule} (SOU-275) when a confirmed preview
 * still carries at least one capacity conflict — a block whose assigned room
 * cannot seat its group. Unlike a schedule double-book (which the admin may
 * force past), seat overflow is a hard commit invariant, so the whole batch is
 * refused up front rather than partially committed and then crashing mid-run on
 * {@link GroupOverCapacityError}: the admin assigns a larger room (or shrinks the
 * group) and re-previews. Distinct from the auto-mode
 * {@link GroupExceedsRoomCapacityError} because it names the *specific assigned*
 * room, not the largest available one. Carries the stable
 * `schedule-capacity-conflict` code for `t(\`errors.${code}\`)`; only the `code`
 * survives the IPC hop, so the message stays i18n-agnostic.
 */
export class GeneratedScheduleCapacityConflictError extends DomainError {
  readonly code = 'schedule-capacity-conflict';

  constructor(
    readonly groupId: GroupId,
    readonly roomId: RoomId,
    readonly groupCapacity: number,
    readonly roomCapacity: number,
  ) {
    super(
      `Group "${groupId}" needs ${groupCapacity} seats but assigned room "${roomId}" holds only ${roomCapacity}.`,
    );
  }
}
