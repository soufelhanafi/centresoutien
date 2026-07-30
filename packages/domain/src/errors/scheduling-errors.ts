import { DomainError } from './plan-errors';
import type { EntityId } from '../value-objects/ids';
import type { TimeOfDay } from '../value-objects/time-of-day';
import type { WeekdayIndex } from '../value-objects/weekday';
import type { RoomId } from '../entities/room';

/** Why a session falls outside the center's opening hours. */
export type OutsideCenterHoursReason = 'closed' | 'before-open' | 'after-close';

/**
 * The minimal shape of an already-scheduled weekly session the room check reads
 * and the {@link RoomConflictError} carries. The caller pre-filters to
 * same-center, non-deleted, active refs — the policy stays pure and never
 * touches the envelope or soft-delete state. Lives here (the leaf that owns the
 * error payload) so `policies` depends on `errors` one-way, never the reverse.
 */
export type ScheduledSessionRef = {
  id: EntityId;
  roomId: RoomId;
  dayOfWeek: WeekdayIndex;
  start: TimeOfDay;
  end: TimeOfDay;
};

/**
 * Thrown when a session would start before the center opens, end after it
 * closes, or fall on a closed day (CLAUDE.md §6, `SessionConflictPolicy`). The
 * `reason` and the day's `open`/`close` are carried so the renderer can build a
 * localized message via `t(\`errors.${...}\`)` without the domain formatting
 * strings. Scheduling wires this at the calendar seam in SOU-55.
 */
export class SessionOutsideCenterHoursError extends DomainError {
  constructor(
    readonly dayOfWeek: WeekdayIndex,
    readonly reason: OutsideCenterHoursReason,
    readonly open: TimeOfDay | null,
    readonly close: TimeOfDay | null,
  ) {
    super(`Session on weekday ${dayOfWeek} is outside center hours (${reason}).`);
  }
}

/**
 * Thrown when a candidate weekly session would overlap one or more active
 * sessions already scheduled in the same room on the same day (CLAUDE.md §6,
 * `SessionConflictPolicy.roomConflict`). The overlapping `conflicts` — plus the
 * `roomId` and `dayOfWeek` — are carried as structured data so the renderer can
 * localize the message and list the clashes, without the domain formatting
 * strings. Scheduling wires this at the calendar seam in SOU-55.
 */
export class RoomConflictError extends DomainError {
  constructor(
    readonly roomId: RoomId,
    readonly dayOfWeek: WeekdayIndex,
    readonly conflicts: readonly ScheduledSessionRef[],
  ) {
    super(`Session on weekday ${dayOfWeek} overlaps ${conflicts.length} session(s) in the same room.`);
  }
}
