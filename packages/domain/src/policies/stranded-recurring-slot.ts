import { toEntityId, type EntityId } from '../value-objects/ids';
import type { WeeklySessionView } from '../read-models/weekly-session-view';
import type { TeacherAvailabilityRules } from './teacher-availability-policy';
import { teacherUnavailabilityFor } from './teacher-availability-policy';

/**
 * A weekly recurring slot the teacher's CURRENT availability rules now place
 * outside their window (SOU-296bis) — flagged from the template itself, before
 * any concrete occurrence is materialized. Complements {@link StrandedSession}:
 * that type only ever sees rows `GenerateAndPersistSessions` already wrote, so a
 * slot created (or left unmaterialized) after an availability edit is otherwise
 * invisible to the standing audit until someone runs the generator for it.
 */
export type StrandedRecurringSlot = {
  readonly session: WeeklySessionView;
};

/**
 * Every live weekly template whose own weekday/window no longer fits its
 * teacher's availability rules. Reuses {@link teacherUnavailabilityFor} with a
 * `null` materialization range — a template carries no dates, so only the
 * weekly-window check applies; one-off exceptions need a concrete date and are
 * covered separately by the materialized-occurrence sweep.
 */
export function findStrandedRecurringSlots(
  sessions: readonly WeeklySessionView[],
  availabilityByTeacher: ReadonlyMap<EntityId, TeacherAvailabilityRules>,
): readonly StrandedRecurringSlot[] {
  const stranded: StrandedRecurringSlot[] = [];
  for (const session of sessions) {
    const conflict = teacherUnavailabilityFor(
      { dayOfWeek: session.dayOfWeek, start: session.start, end: session.end },
      session.teacherId === null ? null : toEntityId(session.teacherId),
      availabilityByTeacher,
      null,
    );
    if (conflict !== null) stranded.push({ session });
  }
  return stranded;
}
