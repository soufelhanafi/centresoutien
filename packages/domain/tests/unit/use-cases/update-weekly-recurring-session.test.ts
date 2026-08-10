import { describe, it, expect, beforeEach } from 'vitest';
import {
  UpdateWeeklyRecurringSession,
  type UpdateWeeklyRecurringSessionInput,
} from '../../../src/use-cases/update-weekly-recurring-session';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { GroupOverCapacityError } from '../../../src/errors/group-errors';
import { GroupNotFoundError } from '../../../src/errors/group-errors';
import { RoomNotFoundError } from '../../../src/errors/room-errors';
import {
  MalformedSessionTimeError,
  RoomConflictError,
  SessionOutsideCenterHoursError,
  SessionOutsideOverrideHoursError,
  TeacherConflictError,
  InvalidSessionValidityRangeError,
  WeeklyRecurringSessionNotFoundError,
} from '../../../src/errors/scheduling-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
} from '../../../src/entities/weekly-recurring-session';
import type { Group, GroupId } from '../../../src/entities/group';
import type { Room, RoomId } from '../../../src/entities/room';
import type { SubjectId } from '../../../src/entities/subject';
import type {
  CenterHoursOverride,
  CenterHoursOverrideId,
  WeeklyTimeWindows,
} from '../../../src/entities/center-hours-override';
import type { CenterCode, DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import { InMemoryWeeklyRecurringSessionRepository } from '../fakes/in-memory-weekly-recurring-session-repository';
import { InMemoryCenterHoursRepository } from '../fakes/in-memory-center-hours-repository';
import { InMemoryCenterHoursOverrideRepository } from '../fakes/in-memory-center-hours-override-repository';
import { InMemoryGroupRepository } from '../fakes/in-memory-group-repository';
import { InMemoryRoomRepository } from '../fakes/in-memory-room-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const EDITOR = 'usr_00000000000000000000000002' as UserId;
const ROOM = 'rom_00000000000000000000000001' as RoomId;
const ROOM_B = 'rom_00000000000000000000000002' as RoomId;
const TEACHER = 'tch_00000000000000000000000001' as EntityId;
const SUBJECT = 'sub_00000000000000000000000001' as SubjectId;
const GROUP = 'grp_00000000000000000000000001' as GroupId;

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: GROUP,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    subjectId: SUBJECT,
    teacherId: null,
    level: '2ème Bac',
    capacity: 15,
    kind: 'regular',
    active: true,
    ...overrides,
  };
}

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: ROOM,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    name: 'Salle A',
    capacity: 20,
    active: true,
    ...overrides,
  };
}

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
    conflictAccepted: false,
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

function windows(...pairs: [string, string][]): readonly { open: TimeOfDay; close: TimeOfDay }[] {
  return pairs.map(([open, close]) => ({ open: open as TimeOfDay, close: close as TimeOfDay }));
}

function weekWindows(byDay: Partial<Record<WeekdayIndex, readonly { open: TimeOfDay; close: TimeOfDay }[]>>): WeeklyTimeWindows {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], ...byDay } as WeeklyTimeWindows;
}

function seededOverride(dateRange: { start: string; end: string }, hoursByWeekday: WeeklyTimeWindows): CenterHoursOverride {
  seq += 1;
  return {
    id: `cho_${String(seq).padStart(26, '0')}` as CenterHoursOverrideId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    dateRange,
    hoursByWeekday,
  };
}

describe('UpdateWeeklyRecurringSession', () => {
  let sessions: InMemoryWeeklyRecurringSessionRepository;
  let groups: InMemoryGroupRepository;
  let rooms: InMemoryRoomRepository;
  let hours: InMemoryCenterHoursRepository;
  let overrides: InMemoryCenterHoursOverrideRepository;
  let clock: ReturnType<typeof fakeClock>;
  let useCase: UpdateWeeklyRecurringSession;

  beforeEach(async () => {
    sessions = new InMemoryWeeklyRecurringSessionRepository();
    groups = new InMemoryGroupRepository();
    rooms = new InMemoryRoomRepository();
    hours = new InMemoryCenterHoursRepository();
    overrides = new InMemoryCenterHoursOverrideRepository();
    await groups.save(makeGroup());
    await rooms.save(makeRoom());
    clock = fakeClock('2026-08-01T12:00:00Z');
    useCase = new UpdateWeeklyRecurringSession(sessions, groups, rooms, hours, overrides, clock, new PlanPolicy(PLANS.essentiel));
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

    it('never mutates conflictAccepted — it is a create-only audit marker (SOU-183)', async () => {
      const existing = seededSession({ conflictAccepted: true });
      await sessions.save(existing);

      const updated = await useCase.execute(editInput(existing.id, { start: '09:30' as TimeOfDay }));

      expect(updated.conflictAccepted).toBe(true);
      const saved = await sessions.findById(existing.id);
      expect(saved?.conflictAccepted).toBe(true);
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
      useCase = new UpdateWeeklyRecurringSession(sessions, groups, rooms, hours, overrides, clock, new PlanPolicy(planWithout));
      await expect(useCase.execute(editInput(existing.id))).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
    });
  });

  // SOU-165 / QA S4: editing a session onto a covered date must honor the override
  // windows too, not only the static hours. Clock is Monday 2026-08-10.
  describe('active center-hours override precedence (SOU-165)', () => {
    const MONDAY = 1 as WeekdayIndex;
    const IFTAR_WEEK = { start: '2026-08-09', end: '2026-08-15' };

    function useCaseOnMonday(): UpdateWeeklyRecurringSession {
      return new UpdateWeeklyRecurringSession(
        sessions,
        groups,
        rooms,
        hours,
        overrides,
        fakeClock('2026-08-10T10:00:00Z'),
        new PlanPolicy(PLANS.premium),
      );
    }

    async function seedIftarOverride(): Promise<void> {
      await overrides.save(
        seededOverride(IFTAR_WEEK, weekWindows({ [MONDAY]: windows(['14:00', '17:00'], ['21:00', '23:00']) })),
      );
    }

    it('rejects an edit that moves a slot into the override iftar gap', async () => {
      await seedIftarOverride();
      const existing = seededSession({ dayOfWeek: MONDAY, start: '15:00' as TimeOfDay, end: '16:00' as TimeOfDay });
      await sessions.save(existing);
      const error = await useCaseOnMonday()
        .execute(editInput(existing.id, { dayOfWeek: MONDAY, start: '17:00' as TimeOfDay, end: '18:00' as TimeOfDay }))
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(SessionOutsideOverrideHoursError);
      expect((error as SessionOutsideOverrideHoursError).code).toBe('outside-windows');
    });

    it('accepts an edit into a late override window that is outside static hours', async () => {
      await seedIftarOverride();
      const existing = seededSession({ dayOfWeek: MONDAY, start: '15:00' as TimeOfDay, end: '16:00' as TimeOfDay });
      await sessions.save(existing);
      const updated = await useCaseOnMonday().execute(
        editInput(existing.id, { dayOfWeek: MONDAY, start: '22:00' as TimeOfDay, end: '23:00' as TimeOfDay }),
      );
      expect(updated.start).toBe('22:00');
    });

    it('falls back to the static outside-hours error when no override covers the slot', async () => {
      const existing = seededSession({ dayOfWeek: MONDAY, start: '09:00' as TimeOfDay, end: '10:00' as TimeOfDay });
      await sessions.save(existing);
      const error = await useCaseOnMonday()
        .execute(editInput(existing.id, { dayOfWeek: MONDAY, start: '22:00' as TimeOfDay, end: '23:00' as TimeOfDay }))
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(SessionOutsideCenterHoursError);
      expect(error).not.toBeInstanceOf(SessionOutsideOverrideHoursError);
    });
  });

  describe('seat-fit gate (SOU-176)', () => {
    it('accepts binding a group to a room that seats it', async () => {
      const existing = seededSession();
      await sessions.save(existing);
      const updated = await useCase.execute(editInput(existing.id, { groupId: GROUP }));
      expect(updated.groupId).toBe(GROUP);
    });

    it('rejects binding a group to a room too small for it', async () => {
      await groups.save(makeGroup({ capacity: 21 }));
      const existing = seededSession();
      await sessions.save(existing);
      await expect(
        useCase.execute(editInput(existing.id, { groupId: GROUP })),
      ).rejects.toBeInstanceOf(GroupOverCapacityError);
    });

    it('rejects moving a bound group to an undersized room', async () => {
      const existing = seededSession({ groupId: GROUP });
      await sessions.save(existing);
      // Room B has capacity 10 (below the group's 15); ROOM (20) fits.
      await rooms.save(makeRoom({ id: ROOM_B as RoomId, capacity: 10 }));
      await expect(
        useCase.execute(editInput(existing.id, { roomId: ROOM_B, groupId: GROUP })),
      ).rejects.toBeInstanceOf(GroupOverCapacityError);
    });

    it('rejects a groupId with no live group', async () => {
      await groups.clear();
      const existing = seededSession();
      await sessions.save(existing);
      await expect(
        useCase.execute(editInput(existing.id, { groupId: GROUP })),
      ).rejects.toBeInstanceOf(GroupNotFoundError);
    });

    it('rejects a room that belongs to another center', async () => {
      await rooms.save(makeRoom({ centerCode: OTHER_CENTER }));
      const existing = seededSession();
      await sessions.save(existing);
      await expect(
        useCase.execute(editInput(existing.id, { groupId: GROUP })),
      ).rejects.toBeInstanceOf(RoomNotFoundError);
    });
  });
});
