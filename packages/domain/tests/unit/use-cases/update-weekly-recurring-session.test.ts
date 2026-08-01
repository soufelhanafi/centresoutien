import { describe, it, expect, beforeEach } from 'vitest';
import {
  UpdateWeeklyRecurringSession,
  type UpdateWeeklyRecurringSessionInput,
} from '../../../src/use-cases/update-weekly-recurring-session';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import {
  MalformedSessionTimeError,
  RoomConflictError,
  TeacherConflictError,
  InvalidSessionValidityRangeError,
  WeeklyRecurringSessionNotFoundError,
} from '../../../src/errors/scheduling-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
} from '../../../src/entities/weekly-recurring-session';
import type { RoomId } from '../../../src/entities/room';
import type { CenterCode, DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import { InMemoryWeeklyRecurringSessionRepository } from '../fakes/in-memory-weekly-recurring-session-repository';
import { InMemoryCenterHoursRepository } from '../fakes/in-memory-center-hours-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const EDITOR = 'usr_00000000000000000000000002' as UserId;
const ROOM = 'rom_00000000000000000000000001' as RoomId;
const ROOM_B = 'rom_00000000000000000000000002' as RoomId;
const TEACHER = 'tch_00000000000000000000000001' as EntityId;

let seq = 0;
function seededSession(over: Partial<WeeklyRecurringSession> = {}): WeeklyRecurringSession {
  seq += 1;
  return {
    id: `wrs_${String(seq).padStart(26, '0')}` as WeeklyRecurringSessionId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock('2026-07-01T08:00:00Z')),
    version: 4, // hub-assigned; an in-place edit must never touch it
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

function editInput(
  id: WeeklyRecurringSessionId,
  overrides: Partial<UpdateWeeklyRecurringSessionInput> = {},
): UpdateWeeklyRecurringSessionInput {
  return {
    id,
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
    updatedBy: EDITOR,
    ...overrides,
  };
}

describe('UpdateWeeklyRecurringSession', () => {
  let sessions: InMemoryWeeklyRecurringSessionRepository;
  let hours: InMemoryCenterHoursRepository;
  let clock: ReturnType<typeof fakeClock>;
  let useCase: UpdateWeeklyRecurringSession;

  beforeEach(() => {
    sessions = new InMemoryWeeklyRecurringSessionRepository();
    hours = new InMemoryCenterHoursRepository();
    clock = fakeClock('2026-08-01T12:00:00Z');
    useCase = new UpdateWeeklyRecurringSession(sessions, hours, clock, new PlanPolicy(PLANS.essentiel));
  });

  describe('happy path', () => {
    it('edits an editable field, bumps updatedAt/updatedBy, and preserves identity + version', async () => {
      const existing = seededSession();
      await sessions.save(existing);

      const updated = await useCase.execute(
        editInput(existing.id, { start: '09:30' as TimeOfDay }),
      );

      expect(updated.start).toBe('09:30');
      expect(updated.id).toBe(existing.id);
      expect(updated.centerCode).toBe(CENTER);
      expect(updated.deviceOrigin).toBe(DEVICE);
      expect(updated.createdAt).toEqual(existing.createdAt);
      expect(updated.version).toBe(4); // untouched — the hub owns it
      expect(updated.updatedBy).toBe(EDITOR);
      expect(updated.updatedAt).toEqual(new Date('2026-08-01T12:00:00Z'));
    });

    it('does not write or bump updatedAt on a no-op edit', async () => {
      const existing = seededSession();
      await sessions.save(existing);

      const result = await useCase.execute(editInput(existing.id));
      // updatedBy/updatedAt unchanged — no spurious sync delta.
      expect(result.updatedBy).toBe(USER);
      expect(result.updatedAt).toEqual(existing.updatedAt);
    });

    it('excludes the edited row from its own conflict check (moving a slot is not a self-clash)', async () => {
      const existing = seededSession({ start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay });
      await sessions.save(existing);

      // Same time, different room — the only overlapping ref is itself, which is excluded.
      const updated = await useCase.execute(editInput(existing.id, { roomId: ROOM_B }));
      expect(updated.roomId).toBe(ROOM_B);
    });
  });

  describe('conflict rejection', () => {
    it('rejects an edit that overlaps ANOTHER slot in the same room', async () => {
      await sessions.save(seededSession({ start: '11:00' as TimeOfDay, end: '12:00' as TimeOfDay }));
      const target = seededSession({ start: '09:00' as TimeOfDay, end: '10:00' as TimeOfDay });
      await sessions.save(target);

      await expect(
        useCase.execute(editInput(target.id, { start: '11:15' as TimeOfDay, end: '11:45' as TimeOfDay })),
      ).rejects.toBeInstanceOf(RoomConflictError);
    });

    it('rejects an edit that overlaps another slot booked for the same teacher', async () => {
      await sessions.save(
        seededSession({ roomId: ROOM_B, teacherId: TEACHER, start: '11:00' as TimeOfDay, end: '12:00' as TimeOfDay }),
      );
      const target = seededSession({ start: '09:00' as TimeOfDay, end: '10:00' as TimeOfDay });
      await sessions.save(target);

      await expect(
        useCase.execute(
          editInput(target.id, { teacherId: TEACHER, start: '11:15' as TimeOfDay, end: '11:45' as TimeOfDay }),
        ),
      ).rejects.toBeInstanceOf(TeacherConflictError);
    });
  });

  describe('validation & guards', () => {
    it('throws WeeklyRecurringSessionNotFoundError for an unknown id', async () => {
      await expect(
        useCase.execute(editInput('wrs_00000000000000000000009999' as WeeklyRecurringSessionId)),
      ).rejects.toBeInstanceOf(WeeklyRecurringSessionNotFoundError);
    });

    it('throws WeeklyRecurringSessionNotFoundError for a foreign-center row', async () => {
      const foreign = seededSession({ centerCode: OTHER_CENTER });
      await sessions.save(foreign);
      await expect(useCase.execute(editInput(foreign.id))).rejects.toBeInstanceOf(
        WeeklyRecurringSessionNotFoundError,
      );
    });

    it('rejects a backwards time range with MalformedSessionTimeError', async () => {
      const existing = seededSession();
      await sessions.save(existing);
      await expect(
        useCase.execute(editInput(existing.id, { start: '11:00' as TimeOfDay, end: '10:00' as TimeOfDay })),
      ).rejects.toBeInstanceOf(MalformedSessionTimeError);
    });

    it('rejects an inverted validity window with InvalidSessionValidityRangeError', async () => {
      const existing = seededSession();
      await sessions.save(existing);
      await expect(
        useCase.execute(editInput(existing.id, { validFrom: '2027-06-30', validTo: '2026-09-01' })),
      ).rejects.toBeInstanceOf(InvalidSessionValidityRangeError);
    });

    it('throws PlanFeatureUnavailableError when the plan lacks core.calendar.week', async () => {
      const existing = seededSession();
      await sessions.save(existing);
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      useCase = new UpdateWeeklyRecurringSession(sessions, hours, clock, new PlanPolicy(planWithout));
      await expect(useCase.execute(editInput(existing.id))).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
    });
  });
});
