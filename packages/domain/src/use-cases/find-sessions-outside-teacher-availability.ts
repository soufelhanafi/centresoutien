import type { WeeklySessionViewReadPort } from '../ports/weekly-session-view-read-port';
import type { TeacherAvailabilityRepository } from '../ports/teacher-availability-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import { toEntityId, type CenterCode } from '../value-objects/ids';
import type { TeacherId } from '../entities/teacher';
import type { WeeklySessionView } from '../read-models/weekly-session-view';
import { teacherUnavailability } from '../policies/teacher-availability-policy';

export type FindSessionsOutsideTeacherAvailabilityInput = {
  centerCode: CenterCode;
  teacherId: TeacherId;
};

export type FindSessionsOutsideTeacherAvailabilityResult = {
  sessions: readonly WeeklySessionView[];
};

/**
 * Read-only re-check (SOU-283): after a teacher's weekly availability is saved,
 * report that teacher's already-scheduled weekly sessions that the *new* windows
 * now place out of window — the drift the save opens up, surfaced for a
 * non-blocking summary popup. The save itself never blocks; this is the follow-up
 * read the frontend calls next.
 *
 * Only the weekly windows are checked (`materializationRange = null` skips the
 * one-off absence pass): `SaveTeacherAvailability` edits windows alone, and
 * absences are a concrete-date concern the interactive checks handle, not a
 * property of a weekly template. A whole-week-empty row (row exists, every
 * weekday empty) flags every session; a teacher with **no** configured row is
 * unrestricted, so the read short-circuits to an empty set — the same
 * absence-of-a-row-means-unrestricted invariant the write path honors.
 *
 * Gated by `planning.teacher-availability` (Pro) — the availability feature this
 * belongs to, not `core.calendar.week`. Scoped to one center; the enriched
 * {@link WeeklySessionView}s (subject/room/teacher names, weekday, time) come
 * straight off {@link WeeklySessionViewReadPort} so the renderer never re-joins.
 */
export class FindSessionsOutsideTeacherAvailability {
  constructor(
    private readonly sessions: WeeklySessionViewReadPort,
    private readonly availability: TeacherAvailabilityRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(
    input: FindSessionsOutsideTeacherAvailabilityInput,
  ): Promise<FindSessionsOutsideTeacherAvailabilityResult> {
    this.plan.require('planning.teacher-availability');

    const row = await this.availability.findByTeacher(input.centerCode, input.teacherId);
    if (row === null) return { sessions: [] };

    const teacherId = toEntityId(input.teacherId);
    const rules = { weeklyWindows: row.weeklyWindows, exceptions: [] as const };
    const week = await this.sessions.listWeekView(input.centerCode);

    const sessions = week.filter((session) => {
      if (session.teacherId === null || toEntityId(session.teacherId) !== teacherId) return false;
      return (
        teacherUnavailability(
          { dayOfWeek: session.dayOfWeek, start: session.start, end: session.end },
          teacherId,
          rules,
          null,
        ) !== null
      );
    });

    return { sessions };
  }
}
