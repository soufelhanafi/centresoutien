import { describe, it, expect, beforeEach } from 'vitest';
import { UpdateRoom } from '../../../src/use-cases/update-room';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { RoomNotFoundError } from '../../../src/errors/room-errors';
import { GroupOverCapacityError } from '../../../src/errors/group-errors';
import { GroupNotFoundError } from '../../../src/errors/group-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Room, RoomId } from '../../../src/entities/room';
import type { Group, GroupId } from '../../../src/entities/group';
import type { SubjectId } from '../../../src/entities/subject';
import type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
} from '../../../src/entities/weekly-recurring-session';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import { InMemoryRoomRepository } from '../fakes/in-memory-room-repository';
import { InMemoryGroupRepository } from '../fakes/in-memory-group-repository';
import { InMemoryWeeklyRecurringSessionRepository } from '../fakes/in-memory-weekly-recurring-session-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const EDITOR = 'usr_00000000000000000000000002' as UserId;
const ROOM_ID = 'rom_00000000000000000000000001' as RoomId;
const SUBJECT_ID = 'sub_00000000000000000000000001' as SubjectId;
const GROUP_ID = 'grp_00000000000000000000000001' as GroupId;

function seededRoom(): Room {
  return {
    id: ROOM_ID,
    ...newEnvelope(
      { centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER },
      fakeClock('2026-07-29T10:00:00Z'),
    ),
    name: 'Salle A',
    capacity: 20,
    active: true,
  };
}

function seededGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: GROUP_ID,
    ...newEnvelope(
      { centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER },
      fakeClock('2026-07-29T10:00:00Z'),
    ),
    subjectId: SUBJECT_ID,
    teacherId: null,
    level: '2ème Bac',
    capacity: 15,
    kind: 'regular',
    active: true,
    ...overrides,
  };
}

function bookedSession(overrides: Partial<WeeklyRecurringSession> = {}): WeeklyRecurringSession {
  return {
    id: 'wrs_00000000000000000000000001' as WeeklyRecurringSessionId,
    ...newEnvelope(
      { centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER },
      fakeClock('2026-07-29T10:00:00Z'),
    ),
    roomId: ROOM_ID,
    teacherId: null,
    groupId: GROUP_ID,
    dayOfWeek: 1,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    active: true,
    validFrom: null,
    validTo: null,
    ...overrides,
  };
}

describe('UpdateRoom', () => {
  let rooms: InMemoryRoomRepository;
  let sessions: InMemoryWeeklyRecurringSessionRepository;
  let groups: InMemoryGroupRepository;
  let useCase: UpdateRoom;

  beforeEach(async () => {
    rooms = new InMemoryRoomRepository();
    sessions = new InMemoryWeeklyRecurringSessionRepository();
    groups = new InMemoryGroupRepository();
    await rooms.save(seededRoom());
    useCase = new UpdateRoom(rooms, sessions, groups, fakeClock('2026-07-30T09:00:00Z'), new PlanPolicy(PLANS.essentiel));
  });

  describe('happy path', () => {
    it('edits name and capacity, bumping updatedAt/updatedBy but not identity or version', async () => {
      const updated = await useCase.execute({
        centerCode: CENTER,
        id: ROOM_ID,
        name: '  Salle B ',
        capacity: 30,
        updatedBy: EDITOR,
      });

      expect(updated.name).toBe('Salle B'); // trimmed by the schema
      expect(updated.capacity).toBe(30);
      expect(updated.updatedAt).toEqual(new Date('2026-07-30T09:00:00Z'));
      expect(updated.updatedBy).toBe(EDITOR);
      // Identity + provenance preserved; version stays the hub's to assign.
      expect(updated.id).toBe(ROOM_ID);
      expect(updated.createdAt).toEqual(new Date('2026-07-29T10:00:00Z'));
      expect(updated.deviceOrigin).toBe(DEVICE);
      expect(updated.version).toBe(0);
      expect(await rooms.findById(ROOM_ID)).toEqual(updated);
    });

    it('is a no-op when nothing changed — updatedAt is not bumped, no spurious delta', async () => {
      const before = await rooms.findById(ROOM_ID);
      const result = await useCase.execute({
        centerCode: CENTER,
        id: ROOM_ID,
        name: 'Salle A',
        capacity: 20,
        updatedBy: EDITOR,
      });

      expect(result).toEqual(before);
      expect(result.updatedBy).toBe(USER); // unchanged — not the editor
      expect(result.updatedAt).toEqual(new Date('2026-07-29T10:00:00Z'));
    });
  });

  describe('validation', () => {
    it('rejects a capacity below 1 and leaves the row untouched', async () => {
      await expect(
        useCase.execute({ centerCode: CENTER, id: ROOM_ID, name: 'Salle A', capacity: 0, updatedBy: EDITOR }),
      ).rejects.toThrow();
      expect((await rooms.findById(ROOM_ID))?.capacity).toBe(20);
    });
  });

  describe('not found / tenant scoping', () => {
    it('throws RoomNotFoundError for an unknown id', async () => {
      await expect(
        useCase.execute({
          centerCode: CENTER,
          id: 'rom_00000000000000000000000099' as RoomId,
          name: 'X',
          capacity: 5,
          updatedBy: EDITOR,
        }),
      ).rejects.toBeInstanceOf(RoomNotFoundError);
    });

    it('throws RoomNotFoundError for a room in another center (no cross-tenant edit)', async () => {
      await expect(
        useCase.execute({ centerCode: OTHER_CENTER, id: ROOM_ID, name: 'X', capacity: 5, updatedBy: EDITOR }),
      ).rejects.toBeInstanceOf(RoomNotFoundError);
      expect((await rooms.findById(ROOM_ID))?.name).toBe('Salle A');
    });

    it('does not resurrect an archived room (findById hides tombstones)', async () => {
      await rooms.softDelete(ROOM_ID, new Date('2026-07-30T00:00:00Z'), USER);
      await expect(
        useCase.execute({ centerCode: CENTER, id: ROOM_ID, name: 'X', capacity: 5, updatedBy: EDITOR }),
      ).rejects.toBeInstanceOf(RoomNotFoundError);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.rooms', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      useCase = new UpdateRoom(rooms, sessions, groups, fakeClock(), new PlanPolicy(planWithout));
      await expect(
        useCase.execute({ centerCode: CENTER, id: ROOM_ID, name: 'X', capacity: 5, updatedBy: EDITOR }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });
  });

  describe('seat-fit guard on capacity shrink (SOU-176)', () => {
    it('allows lowering capacity while every booked group still fits', async () => {
      await groups.save(seededGroup());
      await sessions.save(bookedSession());
      const updated = await useCase.execute({
        centerCode: CENTER,
        id: ROOM_ID,
        name: 'Salle A',
        capacity: 15,
        updatedBy: EDITOR,
      });
      expect(updated.capacity).toBe(15);
    });

    it('rejects lowering capacity below a booked group capacity', async () => {
      await groups.save(seededGroup());
      await sessions.save(bookedSession());
      await expect(
        useCase.execute({ centerCode: CENTER, id: ROOM_ID, name: 'Salle A', capacity: 10, updatedBy: EDITOR }),
      ).rejects.toBeInstanceOf(GroupOverCapacityError);
      expect((await rooms.findById(ROOM_ID))?.capacity).toBe(20);
    });

    it('allows lowering capacity when the room has no bound group', async () => {
      await sessions.save(bookedSession({ groupId: null }));
      const updated = await useCase.execute({
        centerCode: CENTER,
        id: ROOM_ID,
        name: 'Salle A',
        capacity: 5,
        updatedBy: EDITOR,
      });
      expect(updated.capacity).toBe(5);
    });

    it('does not check seat-fit on a capacity increase', async () => {
      await groups.save(seededGroup());
      await sessions.save(bookedSession());
      const updated = await useCase.execute({
        centerCode: CENTER,
        id: ROOM_ID,
        name: 'Salle A',
        capacity: 30,
        updatedBy: EDITOR,
      });
      expect(updated.capacity).toBe(30);
    });

    it('rejects when a booked group row is missing (stale group reference)', async () => {
      await sessions.save(bookedSession());
      await expect(
        useCase.execute({ centerCode: CENTER, id: ROOM_ID, name: 'Salle A', capacity: 10, updatedBy: EDITOR }),
      ).rejects.toBeInstanceOf(GroupNotFoundError);
    });
  });
});
