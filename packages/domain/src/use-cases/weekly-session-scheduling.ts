import {
  detectSessionConflicts,
  type CompositeSessionCandidate,
} from '../policies/composite-session-conflicts';
import type { DayHours } from '../policies/session-conflict-policy';
import type { ScheduledSessionRef } from '../errors/scheduling-errors';
import type { CenterHours } from '../entities/center-hours';
import type { RoomId } from '../entities/room';
import type { EntityId } from '../value-objects/ids';
import type { TimeOfDay } from '../value-objects/time-of-day';
import type { WeekdayIndex } from '../value-objects/weekday';
import { DEFAULT_WEEKLY_HOURS } from '../schemas/center-hours';

/**
 * The domain fields a candidate slot commits (SOU-131). `teacherId` is nullable —
 * a null teacher never participates in the teacher-overlap check.
 */
export type ScheduleCandidateFields = {
  roomId: RoomId;
  teacherId: EntityId | null;
  dayOfWeek: WeekdayIndex;
  start: TimeOfDay;
  end: TimeOfDay;
};

/**
 * The week the composite conflict check reads. When a center has configured its
 * hours, those rows are used directly ({@link CenterHours} satisfies
 * {@link DayHours}); before the first save the repository is empty, and the domain
 * falls back to the same {@link DEFAULT_WEEKLY_HOURS} the Settings form seeds — so
 * a fresh center schedules within the shared default week (09:00–18:00) instead of
 * every day reading as closed. The user narrows it later on the hours screen.
 */
export function resolveWeek(rows: readonly CenterHours[]): readonly DayHours[] {
  if (rows.length > 0) return rows;
  return DEFAULT_WEEKLY_HOURS.map((day) => ({
    dayOfWeek: day.dayOfWeek as WeekdayIndex,
    open: day.open as TimeOfDay | null,
    close: day.close as TimeOfDay | null,
  }));
}

/**
 * Project the candidate to the composite policy shape, omitting `teacherId`
 * entirely when null (under `exactOptionalPropertyTypes` the optional property
 * must be absent, not `undefined`).
 */
export function toCompositeCandidate(fields: ScheduleCandidateFields): CompositeSessionCandidate {
  const base = {
    roomId: fields.roomId,
    dayOfWeek: fields.dayOfWeek,
    start: fields.start,
    end: fields.end,
  };
  return fields.teacherId === null ? base : { ...base, teacherId: fields.teacherId };
}

/**
 * Run the SOU-55 composite check (malformed → hours → room → teacher) and throw
 * the most-blocking conflict when the slot clashes; a free slot returns. The
 * caller pre-scopes `existing` (same center, that weekday, alive) and — on edit —
 * excludes the row being edited so a slot never clashes with itself.
 */
export function assertScheduleFree(
  fields: ScheduleCandidateFields,
  existing: readonly ScheduledSessionRef[],
  week: readonly DayHours[],
): void {
  const conflicts = detectSessionConflicts(toCompositeCandidate(fields), { existing, week });
  const first = conflicts[0];
  if (first) throw first.error;
}
