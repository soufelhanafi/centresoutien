import { describe, it, expect, beforeEach } from 'vitest';
import { WeeklySessionScheduleValidator } from '../../../src/services/weekly-session-schedule-validator';
import type { ScheduleCandidateFields } from '../../../src/use-cases/weekly-session-scheduling';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
import { RoomConflictError } from '../../../src/errors/scheduling-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
} from '../../../src/entities/weekly-recurring-session';
import type { RoomId } from '../../../src/entities/room';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import { InMemoryWeeklyRecurringSessionRepository } from '../fakes/in-memory-weekly-recurring-session-repository';
import { InMemoryCenterHoursRepository } from '../fakes/in-memory-center-hours-repository';
import { InMemoryCenterHoursOverrideRepository } from '../fakes/in-memory-center-hours-override-repository';
import { InMemoryTeacherAvailabilityRepository } from '../fakes/in-memory-teacher-availability-repository';
import { InMemoryTeacherAvailabilityExceptionRepository } from '../fakes/in-memory-teacher-availability-exception-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const ROOM = 'rom_00000000000000000000000001' as RoomId;

function candidate(over: Partial<ScheduleCandidateFields> = {}): ScheduleCandidateFields {
  return {
    roomId: ROOM,
    teacherId: null,
    dayOfWeek: 1 as WeekdayIndex,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    ...over,
  };
}

let seq = 0;
function seededSession(over: Partial<WeeklyRecurringSession> = {}): WeeklyRecurringSession {
  seq += 1;
  return {
    id: `wrs_${String(seq).padStart(26, '0')}` as WeeklyRecurringSessionId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    roomId: ROOM,
    teacherId: null,
    groupId: null,
    dayOfWeek: 1 as WeekdayIndex,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    active: true,
    validFrom: null,
    validTo: null,
    conflictAccepted: false,
    ...over,
  };
}

describe('WeeklySessionScheduleValidator', () => {
  let sessions: InMemoryWeeklyRecurringSessionRepository;
  let validator: WeeklySessionScheduleValidator;

  beforeEach(() => {
    sessions = new InMemoryWeeklyRecurringSessionRepository();
    validator = new WeeklySessionScheduleValidator({
      sessions,
      centerHours: new InMemoryCenterHoursRepository(),
      overrides: new InMemoryCenterHoursOverrideRepository(),
      availability: new InMemoryTeacherAvailabilityRepository(),
      availabilityExceptions: new InMemoryTeacherAvailabilityExceptionRepository(),
      clock: fakeClock('2026-07-29T10:00:00Z'),
      plan: new PlanPolicy(PLANS.essentiel),
    });
  });

  it('returns for a free slot within the default hours', async () => {
    await expect(validator.assertSlotFree(CENTER, candidate())).resolves.toBeUndefined();
  });

  it('throws the composite conflict when the slot overlaps a live session in the same room', async () => {
    await sessions.save(seededSession({ start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay }));
    await expect(
      validator.assertSlotFree(CENTER, candidate({ start: '10:00' as TimeOfDay, end: '11:00' as TimeOfDay })),
    ).rejects.toBeInstanceOf(RoomConflictError);
  });

  it('excludes the row under edit so a slot never clashes with itself', async () => {
    const existing = seededSession({ start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay });
    await sessions.save(existing);
    await expect(
      validator.assertSlotFree(CENTER, candidate({ start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay }), existing.id),
    ).resolves.toBeUndefined();
  });
});
