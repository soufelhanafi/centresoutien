import { describe, it, expect, beforeEach } from 'vitest';
import {
  CreateWeeklyRecurringSession,
  type CreateWeeklyRecurringSessionInput,
} from '../../../src/use-cases/create-weekly-recurring-session';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import {
  MalformedSessionTimeError,
  RoomConflictError,
  SessionOutsideCenterHoursError,
  TeacherConflictError,
  InvalidSessionValidityRangeError,
} from '../../../src/errors/scheduling-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
} from '../../../src/entities/weekly-recurring-session';
import type { RoomId } from '../../../src/entities/room';
import type { CenterHours, CenterHoursId } from '../../../src/entities/center-hours';
import type { CenterCode, DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import { InMemoryWeeklyRecurringSessionRepository } from '../fakes/in-memory-weekly-recurring-session-repository';
import { InMemoryCenterHoursRepository } from '../fakes/in-memory-center-hours-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const ROOM = 'rom_00000000000000000000000001' as RoomId;
const TEACHER = 'tch_00000000000000000000000001' as EntityId;

function validInput(
  overrides: Partial<CreateWeeklyRecurringSessionInput> = {},
): CreateWeeklyRecurringSessionInput {
  return {
    roomId: ROOM,
    teacherId: null,
    groupId: null,
    dayOfWeek: 1,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    active: true,
    validFrom: null,
    validTo: null,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

let seq = 100;
function seededSession(over: Partial<WeeklyRecurringSession> = {}): WeeklyRecurringSession {
  seq += 1;
  return {
    id: `wrs_${String(seq).padStart(26, '0')}` as WeeklyRecurringSessionId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    roomId: ROOM,
    teacherId: null,
    groupId: null,
    dayOfWeek: 1,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    active: true,
    validFrom: null,
    validTo: null,
    ...over,
  };
}

function seededHours(dayOfWeek: WeekdayIndex, open: string | null, close: string | null): CenterHours {
  seq += 1;
  return {
    id: `chr_${String(seq).padStart(26, '0')}` as CenterHoursId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    dayOfWeek,
    open: open as TimeOfDay | null,
    close: close as TimeOfDay | null,
  };
}

describe('CreateWeeklyRecurringSession', () => {
  let sessions: InMemoryWeeklyRecurringSessionRepository;
  let hours: InMemoryCenterHoursRepository;
  let useCase: CreateWeeklyRecurringSession;

  beforeEach(() => {
    sessions = new InMemoryWeeklyRecurringSessionRepository();
    hours = new InMemoryCenterHoursRepository();
    useCase = new CreateWeeklyRecurringSession(
      sessions,
      hours,
      fakeClock('2026-07-29T10:00:00Z'),
      fakeIds(),
      new PlanPolicy(PLANS.essentiel),
    );
  });

  describe('happy path', () => {
    it('creates a prefixed, active slot with a fresh envelope and default optional fields', async () => {
      const session = await useCase.execute(validInput());

      expect(session.id).toMatch(/^wrs_/);
      expect(session.roomId).toBe(ROOM);
      expect(session.teacherId).toBeNull();
      expect(session.groupId).toBeNull();
      expect(session.dayOfWeek).toBe(1);
      expect(session.start).toBe('09:00');
      expect(session.end).toBe('10:30');
      expect(session.active).toBe(true);
      expect(session.validFrom).toBeNull();
      expect(session.validTo).toBeNull();

      expect(session.centerCode).toBe(CENTER);
      expect(session.deviceOrigin).toBe(DEVICE);
      expect(session.updatedBy).toBe(USER);
      expect(session.createdAt).toEqual(new Date('2026-07-29T10:00:00Z'));
      expect(session.updatedAt).toEqual(session.createdAt);
      expect(session.deletedAt).toBeNull();
      expect(session.version).toBe(0);
    });

    it('persists the slot so it can be read back by id', async () => {
      const session = await useCase.execute(validInput());
      expect(await sessions.findById(session.id)).toEqual(session);
    });

    it('accepts an optional teacher, group, and validity window when provided', async () => {
      const session = await useCase.execute(
        validInput({
          teacherId: TEACHER,
          groupId: 'grp_00000000000000000000000001',
          validFrom: '2026-09-01',
          validTo: '2027-06-30',
        }),
      );
      expect(session.teacherId).toBe(TEACHER);
      expect(session.groupId).toBe('grp_00000000000000000000000001');
      expect(session.validFrom).toBe('2026-09-01');
      expect(session.validTo).toBe('2027-06-30');
    });

    it('allows a back-to-back slot in the same room (touching endpoints do not overlap)', async () => {
      await sessions.save(seededSession({ start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay }));
      const session = await useCase.execute(
        validInput({ start: '10:30' as TimeOfDay, end: '12:00' as TimeOfDay }),
      );
      expect(session.start).toBe('10:30');
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.calendar.week', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      useCase = new CreateWeeklyRecurringSession(
        sessions,
        hours,
        fakeClock(),
        fakeIds(),
        new PlanPolicy(planWithout),
      );
      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
      expect(sessions.all()).toHaveLength(0);
    });
  });

  describe('conflict rejection', () => {
    it('rejects a room overlap with RoomConflictError', async () => {
      await sessions.save(seededSession({ roomId: ROOM, start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay }));
      await expect(
        useCase.execute(validInput({ start: '10:00' as TimeOfDay, end: '11:00' as TimeOfDay })),
      ).rejects.toBeInstanceOf(RoomConflictError);
      expect(sessions.all()).toHaveLength(1);
    });

    it('rejects a teacher overlap with TeacherConflictError', async () => {
      // Different room, so only the teacher clashes.
      await sessions.save(
        seededSession({
          roomId: 'rom_00000000000000000000000009' as RoomId,
          teacherId: TEACHER,
          start: '09:00' as TimeOfDay,
          end: '10:30' as TimeOfDay,
        }),
      );
      await expect(
        useCase.execute(
          validInput({ teacherId: TEACHER, start: '10:00' as TimeOfDay, end: '11:00' as TimeOfDay }),
        ),
      ).rejects.toBeInstanceOf(TeacherConflictError);
      expect(sessions.all()).toHaveLength(1);
    });

    it('rejects a slot outside the (default) center hours with SessionOutsideCenterHoursError', async () => {
      // No center hours saved → domain falls back to DEFAULT 09:00–18:00; 08:00 is before open.
      await expect(
        useCase.execute(validInput({ start: '08:00' as TimeOfDay, end: '08:45' as TimeOfDay })),
      ).rejects.toBeInstanceOf(SessionOutsideCenterHoursError);
      expect(sessions.all()).toHaveLength(0);
    });

    it('uses the center CONFIGURED hours over the default when they are saved', async () => {
      // Monday configured 08:00–12:00: an 08:30 slot (before the 09:00 default open)
      // is now allowed, proving the configured week — not the default — is read.
      await hours.save(seededHours(1, '08:00', '12:00'));
      const session = await useCase.execute(
        validInput({ start: '08:30' as TimeOfDay, end: '09:30' as TimeOfDay }),
      );
      expect(session.start).toBe('08:30');

      // ...and a slot before the configured 08:00 open is still rejected.
      await expect(
        useCase.execute(validInput({ start: '07:30' as TimeOfDay, end: '08:00' as TimeOfDay })),
      ).rejects.toBeInstanceOf(SessionOutsideCenterHoursError);
    });
  });

  describe('validation', () => {
    it('rejects a backwards time range with MalformedSessionTimeError', async () => {
      await expect(
        useCase.execute(validInput({ start: '11:00' as TimeOfDay, end: '10:00' as TimeOfDay })),
      ).rejects.toBeInstanceOf(MalformedSessionTimeError);
      expect(sessions.all()).toHaveLength(0);
    });

    it('rejects a zero-length slot with MalformedSessionTimeError', async () => {
      await expect(
        useCase.execute(validInput({ start: '10:00' as TimeOfDay, end: '10:00' as TimeOfDay })),
      ).rejects.toBeInstanceOf(MalformedSessionTimeError);
    });

    it('rejects a malformed roomId (wrong prefix)', async () => {
      await expect(
        useCase.execute(validInput({ roomId: 'xxx_1' as RoomId })),
      ).rejects.toThrow();
      expect(sessions.all()).toHaveLength(0);
    });

    it('rejects an inverted validity window with InvalidSessionValidityRangeError', async () => {
      await expect(
        useCase.execute(validInput({ validFrom: '2027-06-30', validTo: '2026-09-01' })),
      ).rejects.toBeInstanceOf(InvalidSessionValidityRangeError);
      expect(sessions.all()).toHaveLength(0);
    });

    it('rejects a weekday outside 0..6', async () => {
      await expect(
        useCase.execute(validInput({ dayOfWeek: 9 as WeekdayIndex })),
      ).rejects.toThrow();
    });
  });
});
