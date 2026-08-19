import {
  FindSessionsOutsideTeacherAvailability,
  type Clock,
  type PlanPolicy,
  type SessionOccurrenceViewReadPort,
  type TeacherAvailabilityExceptionRepository,
  type TeacherAvailabilityRepository,
  type WeeklySessionViewReadPort,
} from '@centresoutien/domain';

// The post-save availability re-check (SOU-283, SOU-287) wiring, split out of
// `composition-root.ts` so that grandfathered file stops growing. Reads the
// enriched week off the weekly-session repo and dated occurrences off the
// concrete-session repo.
export function wireFindSessionsOutsideTeacherAvailability(
  sessions: WeeklySessionViewReadPort,
  occurrences: SessionOccurrenceViewReadPort,
  availability: TeacherAvailabilityRepository,
  availabilityExceptions: TeacherAvailabilityExceptionRepository,
  plan: PlanPolicy,
  clock: Clock,
): FindSessionsOutsideTeacherAvailability {
  return new FindSessionsOutsideTeacherAvailability(
    sessions,
    occurrences,
    availability,
    availabilityExceptions,
    plan,
    clock,
  );
}
