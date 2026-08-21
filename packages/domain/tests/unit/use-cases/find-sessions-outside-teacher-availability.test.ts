import { describe, it, expect, beforeEach } from 'vitest';
import { FindSessionsOutsideTeacherAvailability } from '../../../src/use-cases/find-sessions-outside-teacher-availability';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { TeacherId } from '../../../src/entities/teacher';
import type {
  TeacherAvailability,
  TeacherAvailabilityId,
} from '../../../src/entities/teacher-availability';
import type {
  TeacherAvailabilityException,
  TeacherAvailabilityExceptionId,
} from '../../../src/entities/teacher-availability-exception';
import type { WeeklyTimeWindows } from '../../../src/entities/center-hours-override';
import type { WeeklySessionView } from '../../../src/read-models/weekly-session-view';
import type { SessionOccurrenceView } from '../../../src/read-models/session-occurrence-view';
import type { SessionId } from '../../../src/entities/session';
import type { WeeklyRecurringSessionId } from '../../../src/entities/weekly-recurring-session';
import type { RoomId } from '../../../src/entities/room';
import type { GroupId } from '../../../src/entities/group';
import type { SubjectId } from '../../../src/entities/subject';
import type { CenterCode, DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { TimeWindow } from '../../../src/value-objects/time-window';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import { InMemoryWeeklySessionViewReadPort } from '../fakes/in-memory-weekly-session-view-read-port';
import { InMemorySessionOccurrenceViewReadPort } from '../fakes/in-memory-session-occurrence-view-read-port';
import { InMemoryTeacherAvailabilityRepository } from '../fakes/in-memory-teacher-availability-repository';
import { InMemoryTeacherAvailabilityExceptionRepository } from '../fakes/in-memory-teacher-availability-exception-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const ROOM = 'rom_00000000000000000000000001' as RoomId;
const GROUP = 'grp_00000000000000000000000001' as GroupId;
const SUBJECT = 'sub_00000000000000000000000001' as SubjectId;
const TEACHER = 'tch_00000000000000000000000001' as TeacherId;
const OTHER_TEACHER = 'tch_00000000000000000000000002' as TeacherId;
const MONDAY = 1 as WeekdayIndex;

let seq = 0;
function view(over: Partial<WeeklySessionView> = {}): WeeklySessionView {
  seq += 1;
  return {
    id: `wrs_${String(seq).padStart(26, '0')}` as WeeklyRecurringSessionId,
    dayOfWeek: MONDAY,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    roomId: ROOM,
    roomName: 'Salle A',
    teacherId: TEACHER as string as EntityId,
    teacherName: { fr: 'Prof', ar: 'أستاذ' },
    groupId: GROUP,
    subjectId: SUBJECT,
    subjectName: { fr: 'Maths', ar: 'رياضيات' },
    level: '2e Bac',
    kind: 'regular',
    ...over,
  };
}

function weekWindows(byDay: Partial<Record<WeekdayIndex, readonly TimeWindow[]>>): WeeklyTimeWindows {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], ...byDay } as WeeklyTimeWindows;
}

function occurrenceView(over: Partial<SessionOccurrenceView> = {}): SessionOccurrenceView {
  seq += 1;
  return {
    id: `ses_${String(seq).padStart(26, '0')}` as SessionId,
    recurringSessionId: `wrs_${String(seq).padStart(26, '0')}` as WeeklyRecurringSessionId,
    date: '2026-09-14',
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    roomId: ROOM,
    roomName: 'Salle A',
    roomCapacity: 20,
    roomArchived: false,
    teacherId: TEACHER as string as EntityId,
    teacherName: { fr: 'Prof', ar: 'أستاذ' },
    groupId: GROUP,
    subjectId: SUBJECT,
    subjectName: { fr: 'Maths', ar: 'رياضيات' },
    level: '2e Bac',
    kind: 'regular',
    ...over,
  };
}

function seededException(
  dateRange: { start: string; end: string },
  teacherId = TEACHER,
): TeacherAvailabilityException {
  seq += 1;
  return {
    id: `tae_${String(seq).padStart(26, '0')}` as TeacherAvailabilityExceptionId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    teacherId,
    dateRange,
    label: null,
  };
}

function seededAvailability(weeklyWindows: WeeklyTimeWindows, teacherId = TEACHER): TeacherAvailability {
  seq += 1;
  return {
    id: `tav_${String(seq).padStart(26, '0')}` as TeacherAvailabilityId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    teacherId,
    weeklyWindows,
  };
}

describe('FindSessionsOutsideTeacherAvailability', () => {
  let sessions: InMemoryWeeklySessionViewReadPort;
  let occurrences: InMemorySessionOccurrenceViewReadPort;
  let availability: InMemoryTeacherAvailabilityRepository;
  let exceptions: InMemoryTeacherAvailabilityExceptionRepository;
  let useCase: FindSessionsOutsideTeacherAvailability;

  beforeEach(() => {
    seq = 0;
    sessions = new InMemoryWeeklySessionViewReadPort();
    occurrences = new InMemorySessionOccurrenceViewReadPort();
    availability = new InMemoryTeacherAvailabilityRepository();
    exceptions = new InMemoryTeacherAvailabilityExceptionRepository();
    useCase = new FindSessionsOutsideTeacherAvailability(
      sessions,
      occurrences,
      availability,
      exceptions,
      { plan: new PlanPolicy(PLANS.pro), clock: fakeClock('2026-09-01T10:00:00Z') },
    );
  });

  it('returns the teacher sessions now outside the saved weekly windows', async () => {
    const outOfWindow = view({ start: '14:00' as TimeOfDay, end: '15:00' as TimeOfDay });
    const inWindow = view({ start: '09:00' as TimeOfDay, end: '10:00' as TimeOfDay });
    sessions.seed(CENTER, [outOfWindow, inWindow]);
    await availability.save(seededAvailability(weekWindows({ [MONDAY]: [{ open: '09:00' as TimeOfDay, close: '12:00' as TimeOfDay }] })));

    const result = await useCase.execute({ centerCode: CENTER, teacherId: TEACHER });
    expect(result.sessions).toEqual([outOfWindow]);
    expect(result.occurrences).toEqual([]);
  });

  it('flags every session for a whole-week-off row', async () => {
    const a = view({ start: '09:00' as TimeOfDay, end: '10:00' as TimeOfDay });
    const b = view({ dayOfWeek: 3 as WeekdayIndex, start: '11:00' as TimeOfDay, end: '12:00' as TimeOfDay });
    sessions.seed(CENTER, [a, b]);
    await availability.save(seededAvailability(weekWindows({})));

    const result = await useCase.execute({ centerCode: CENTER, teacherId: TEACHER });
    expect(result.sessions).toEqual([a, b]);
  });

  it('returns an empty set when the teacher has no configured row (unrestricted)', async () => {
    sessions.seed(CENTER, [view({ start: '14:00' as TimeOfDay, end: '15:00' as TimeOfDay })]);
    const result = await useCase.execute({ centerCode: CENTER, teacherId: TEACHER });
    expect(result.sessions).toEqual([]);
    expect(result.occurrences).toEqual([]);
  });

  it('ignores sessions belonging to a different teacher', async () => {
    const mine = view({ start: '14:00' as TimeOfDay, end: '15:00' as TimeOfDay });
    const theirs = view({ teacherId: OTHER_TEACHER as string as EntityId, start: '14:00' as TimeOfDay, end: '15:00' as TimeOfDay });
    const unassigned = view({ teacherId: null, start: '14:00' as TimeOfDay, end: '15:00' as TimeOfDay });
    sessions.seed(CENTER, [mine, theirs, unassigned]);
    await availability.save(seededAvailability(weekWindows({})));

    const result = await useCase.execute({ centerCode: CENTER, teacherId: TEACHER });
    expect(result.sessions).toEqual([mine]);
  });

  it('returns nothing when all the teacher sessions still fit the new windows', async () => {
    sessions.seed(CENTER, [view({ start: '09:00' as TimeOfDay, end: '10:00' as TimeOfDay })]);
    await availability.save(seededAvailability(weekWindows({ [MONDAY]: [{ open: '09:00' as TimeOfDay, close: '12:00' as TimeOfDay }] })));

    const result = await useCase.execute({ centerCode: CENTER, teacherId: TEACHER });
    expect(result.sessions).toEqual([]);
  });

  it('reports a dated occurrence covered by a one-off absence, even with no weekly row', async () => {
    const covered = occurrenceView({ date: '2026-09-14' });
    const later = occurrenceView({ date: '2026-10-05' });
    occurrences.seed(covered);
    occurrences.seed(later);
    await exceptions.save(seededException({ start: '2026-09-12', end: '2026-09-16' }));

    const result = await useCase.execute({ centerCode: CENTER, teacherId: TEACHER });
    expect(result.sessions).toEqual([]);
    expect(result.occurrences).toEqual([covered]);
  });

  it('ignores dated occurrences of a different teacher or a past date', async () => {
    const mine = occurrenceView({ date: '2026-09-14' });
    const theirs = occurrenceView({
      date: '2026-09-14',
      teacherId: OTHER_TEACHER as string as EntityId,
    });
    const past = occurrenceView({ date: '2026-08-30' });
    occurrences.seed(mine);
    occurrences.seed(theirs);
    occurrences.seed(past);
    await exceptions.save(seededException({ start: '2026-09-01', end: '2026-09-30' }));

    const result = await useCase.execute({ centerCode: CENTER, teacherId: TEACHER });
    expect(result.occurrences).toEqual([mine]);
  });

  it('throws PlanFeatureUnavailableError when the plan lacks planning.teacher-availability', async () => {
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(['core.calendar.week']),
      limits: PLANS.essentiel.limits,
    };
    useCase = new FindSessionsOutsideTeacherAvailability(
      sessions,
      occurrences,
      availability,
      exceptions,
      { plan: new PlanPolicy(planWithout), clock: fakeClock() },
    );
    await expect(useCase.execute({ centerCode: CENTER, teacherId: TEACHER })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
