import type { WeeklySessionViewReadPort } from '../ports/weekly-session-view-read-port';
import type { SessionOccurrenceViewReadPort } from '../ports/session-occurrence-view-read-port';
import type { TeacherAvailabilityRepository } from '../ports/teacher-availability-repository';
import type { TeacherAvailabilityExceptionRepository } from '../ports/teacher-availability-exception-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import { toEntityId, type CenterCode, type EntityId } from '../value-objects/ids';
import type { TeacherId } from '../entities/teacher';
import type { TeacherAvailability } from '../entities/teacher-availability';
import type { DateRange } from '../value-objects/date-range';
import type { WeeklySessionView } from '../read-models/weekly-session-view';
import type { SessionOccurrenceView } from '../read-models/session-occurrence-view';
import { absenceCoversDate, teacherUnavailability } from '../policies/teacher-availability-policy';

export type FindSessionsOutsideTeacherAvailabilityInput = {
  centerCode: CenterCode;
  teacherId: TeacherId;
};

export type FindSessionsOutsideTeacherAvailabilityResult = {
  // Weekly templates the new windows now place out of window.
  sessions: readonly WeeklySessionView[];
  // Dated occurrences a one-off absence now covers (SOU-287).
  occurrences: readonly SessionOccurrenceView[];
};

// Read-only re-check (SOU-283, extended SOU-287): after a teacher's availability
// is saved — weekly windows OR a one-off absence — report that teacher's
// already-scheduled sessions the new rules now place outside availability, for a
// non-blocking summary popup. `sessions` are out-of-window weekly templates (a
// whole-week-empty row flags every one; a teacher with no row stays unrestricted,
// so this stays empty). `occurrences` are dated occurrences a one-off absence now
// covers, checked today-forward. Gated by `planning.teacher-availability` (Pro).
// Scoped to one center; the enriched views come straight off their read ports.
export class FindSessionsOutsideTeacherAvailability {
  constructor(
    private readonly sessions: WeeklySessionViewReadPort,
    private readonly occurrences: SessionOccurrenceViewReadPort,
    private readonly availability: TeacherAvailabilityRepository,
    private readonly availabilityExceptions: TeacherAvailabilityExceptionRepository,
    private readonly plan: PlanPolicy,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: FindSessionsOutsideTeacherAvailabilityInput,
  ): Promise<FindSessionsOutsideTeacherAvailabilityResult> {
    this.plan.require('planning.teacher-availability');

    const teacherId = toEntityId(input.teacherId);
    const [row, exceptions] = await Promise.all([
      this.availability.findByTeacher(input.centerCode, input.teacherId),
      this.availabilityExceptions.listForTeacher(input.centerCode, input.teacherId),
    ]);
    const absenceRanges = exceptions.map((exception) => exception.dateRange);

    return {
      sessions: await this.outOfWindowSessions(input.centerCode, teacherId, row),
      occurrences: await this.exceptionCoveredOccurrences(input.centerCode, teacherId, absenceRanges),
    };
  }

  private async outOfWindowSessions(
    centerCode: CenterCode,
    teacherId: EntityId,
    row: TeacherAvailability | null,
  ): Promise<readonly WeeklySessionView[]> {
    if (row === null) return [];
    const rules = { weeklyWindows: row.weeklyWindows, exceptions: [] as const };
    const week = await this.sessions.listWeekView(centerCode);
    return week.filter((session) => {
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
  }

  private async exceptionCoveredOccurrences(
    centerCode: CenterCode,
    teacherId: EntityId,
    absences: readonly DateRange[],
  ): Promise<readonly SessionOccurrenceView[]> {
    if (absences.length === 0) return [];
    const today = this.clock.now().toISOString().slice(0, 10);
    const occurrences = await this.occurrences.listActiveOccurrenceViews(centerCode, today);
    return occurrences.filter(
      (occurrence) =>
        occurrence.teacherId !== null &&
        toEntityId(occurrence.teacherId) === teacherId &&
        absences.some((absence) => absenceCoversDate(occurrence.date, absence)),
    );
  }
}
