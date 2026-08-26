import { describe, it, expect, beforeEach } from 'vitest';
import {
  CreateWeeklyRecurringSession,
  type CreateWeeklyRecurringSessionInput,
} from '../../../src/use-cases/create-weekly-recurring-session';
import {
  UpdateWeeklyRecurringSession,
  type UpdateWeeklyRecurringSessionInput,
} from '../../../src/use-cases/update-weekly-recurring-session';
import { WeeklySessionScheduleValidator } from '../../../src/services/weekly-session-schedule-validator';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
import { TeacherUnavailableError } from '../../../src/errors/teacher-availability-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
} from '../../../src/entities/weekly-recurring-session';
import type { Group, GroupId } from '../../../src/entities/group';
import type { Room, RoomId } from '../../../src/entities/room';
import type { SubjectId } from '../../../src/entities/subject';
import type { TeacherId } from '../../../src/entities/teacher';
import type {
  TeacherAvailabilityException,
  TeacherAvailabilityExceptionId,
} from '../../../src/entities/teacher-availability-exception';
import type { CenterCode, DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import { InMemoryWeeklyRecurringSessionRepository } from '../fakes/in-memory-weekly-recurring-session-repository';
import { InMemoryCenterHoursRepository } from '../fakes/in-memory-center-hours-repository';
import { InMemoryCenterHoursOverrideRepository } from '../fakes/in-memory-center-hours-override-repository';
import { InMemoryGroupRepository } from '../fakes/in-memory-group-repository';
import { InMemoryRoomRepository } from '../fakes/in-memory-room-repository';
import { InMemoryTeacherAvailabilityRepository } from '../fakes/in-memory-teacher-availability-repository';
import { InMemoryTeacherAvailabilityExceptionRepository } from '../fakes/in-memory-teacher-availability-exception-repository';
import { InMemoryEnrollmentRepository } from '../fakes/in-memory-enrollment-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const ROOM = 'rom_00000000000000000000000001' as RoomId;
const TEACHER = 'tch_00000000000000000000000001' as EntityId;
const SUBJECT = 'sub_00000000000000000000000001' as SubjectId;
const GROUP = 'grp_00000000000000000000000001' as GroupId;
const MONDAY = 1 as WeekdayIndex;

let seq = 0;
function seededException(dateRange: { start: string; end: string }): TeacherAvailabilityException {
  seq += 1;
  return {
    id: `tae_${String(seq).padStart(26, '0')}` as TeacherAvailabilityExceptionId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    teacherId: TEACHER as string as TeacherId,
    dateRange,
    label: null,
  };
}

function seededSession(): WeeklyRecurringSession {
  seq += 1;
  return {
    id: `wrs_${String(seq).padStart(26, '0')}` as WeeklyRecurringSessionId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    roomId: ROOM,
    teacherId: TEACHER,
    groupId: null,
    dayOfWeek: MONDAY,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    active: true,
    validFrom: null,
    validTo: null,
    conflictAccepted: false,
  };
}

function makeGroup(): Group {
  return {
    id: GROUP,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    subjectId: SUBJECT,
    teacherId: null,
    level: '2ème Bac',
    capacity: 15,
    kind: 'regular',
    active: true,
  };
}

function makeRoom(): Room {
  return {
    id: ROOM,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    name: 'Salle A',
    capacity: 20,
    active: true,
  };
}

// Clock is Wed 2026-07-29; the Monday of that week (Sunday-start) is 2026-07-27.
// The teacher has NO weekly row, so only the one-off absence can flag a slot — the
// exception must fire only when the recurrence actually materializes on 07-27.
describe('weekly-session exception × recurrence validity (SOU-287)', () => {
  let sessions: InMemoryWeeklyRecurringSessionRepository;
  let groups: InMemoryGroupRepository;
  let rooms: InMemoryRoomRepository;
  let hours: InMemoryCenterHoursRepository;
  let overrides: InMemoryCenterHoursOverrideRepository;
  let availability: InMemoryTeacherAvailabilityRepository;
  let availabilityExceptions: InMemoryTeacherAvailabilityExceptionRepository;

  beforeEach(async () => {
    seq = 0;
    sessions = new InMemoryWeeklyRecurringSessionRepository();
    groups = new InMemoryGroupRepository();
    rooms = new InMemoryRoomRepository();
    hours = new InMemoryCenterHoursRepository();
    overrides = new InMemoryCenterHoursOverrideRepository();
    availability = new InMemoryTeacherAvailabilityRepository();
    availabilityExceptions = new InMemoryTeacherAvailabilityExceptionRepository();
    await groups.save(makeGroup());
    await rooms.save(makeRoom());
  });

  function validator(clock: ReturnType<typeof fakeClock>): WeeklySessionScheduleValidator {
    return new WeeklySessionScheduleValidator({
      sessions,
      centerHours: hours,
      overrides,
      availability,
      availabilityExceptions,
      enrollments: new InMemoryEnrollmentRepository(),
      clock,
      plan: new PlanPolicy(PLANS.essentiel),
    });
  }

  function createUseCase(): CreateWeeklyRecurringSession {
    return new CreateWeeklyRecurringSession(sessions, groups, rooms, validator(fakeClock('2026-07-29T10:00:00Z')), {
      clock: fakeClock('2026-07-29T10:00:00Z'),
      ids: fakeIds(),
      plan: new PlanPolicy(PLANS.essentiel),
    });
  }

  function updateUseCase(): UpdateWeeklyRecurringSession {
    return new UpdateWeeklyRecurringSession(sessions, groups, rooms, validator(fakeClock('2026-07-29T10:00:00Z')), {
      clock: fakeClock('2026-07-29T10:00:00Z'),
      plan: new PlanPolicy(PLANS.essentiel),
    });
  }

  const createInput = (over: Partial<CreateWeeklyRecurringSessionInput> = {}): CreateWeeklyRecurringSessionInput => ({
    roomId: ROOM,
    teacherId: TEACHER,
    groupId: null,
    dayOfWeek: MONDAY,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    active: true,
    validFrom: null,
    validTo: null,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...over,
  });

  const updateInput = (
    id: WeeklyRecurringSessionId,
    over: Partial<UpdateWeeklyRecurringSessionInput> = {},
  ): UpdateWeeklyRecurringSessionInput => ({
    id,
    roomId: ROOM,
    teacherId: TEACHER,
    groupId: null,
    dayOfWeek: MONDAY,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    active: true,
    validFrom: null,
    validTo: null,
    centerCode: CENTER,
    updatedBy: USER,
    ...over,
  });

  async function seedAbsence(): Promise<void> {
    await availabilityExceptions.save(seededException({ start: '2026-07-27', end: '2026-07-27' }));
  }

  it('create does not warn about an absence before the recurrence starts', async () => {
    await seedAbsence();
    const session = await createUseCase().execute(
      createInput({ validFrom: '2026-09-01', validTo: null }),
    );
    expect(session.teacherId).toBe(TEACHER);
    expect(session.conflictAccepted).toBe(false);
  });

  it('create does not warn about an absence after the recurrence already ended', async () => {
    await seedAbsence();
    const session = await createUseCase().execute(
      createInput({ validFrom: null, validTo: '2026-07-26' }),
    );
    expect(session.teacherId).toBe(TEACHER);
    expect(session.conflictAccepted).toBe(false);
  });

  it('create still warns about an absence covering a real occurrence in the validity window', async () => {
    await seedAbsence();
    const error = await createUseCase()
      .execute(createInput({ validFrom: '2026-07-20', validTo: '2026-08-15' }))
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(TeacherUnavailableError);
    expect((error as TeacherUnavailableError).reason).toBe('exception');
  });

  it('update does not warn about an absence on a date the recurrence never materializes', async () => {
    await seedAbsence();
    const existing = seededSession();
    await sessions.save(existing);
    const updated = await updateUseCase().execute(
      updateInput(existing.id, { validFrom: '2026-09-01', validTo: null }),
    );
    expect(updated.teacherId).toBe(TEACHER);
    expect(updated.conflictAccepted).toBe(false);
  });
});
