import { describe, it, expect, beforeEach } from 'vitest';
import { ArchiveRoom } from '../../../src/use-cases/archive-room';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { RoomInUseError, RoomNotFoundError } from '../../../src/errors/room-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Room, RoomId } from '../../../src/entities/room';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryRoomRepository } from '../fakes/in-memory-room-repository';
import { fakeRoomReference } from '../fakes/fake-room-reference';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const ROOM_ID = 'rom_00000000000000000000000001' as RoomId;

function seededRoom(createdAt: string): Room {
  return {
    id: ROOM_ID,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock(createdAt)),
    name: 'Salle A',
    capacity: 20,
    active: true,
  };
}

describe('ArchiveRoom', () => {
  let rooms: InMemoryRoomRepository;

  beforeEach(async () => {
    rooms = new InMemoryRoomRepository();
    await rooms.save(seededRoom('2026-07-29T10:00:00Z'));
  });

  describe('happy path', () => {
    it('soft-deletes a room that no active session references', async () => {
      const useCase = new ArchiveRoom(
        rooms,
        fakeRoomReference(),
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );

      await useCase.execute({ centerCode: CENTER, roomId: ROOM_ID, updatedBy: USER });

      // Tombstoned: excluded from default reads...
      expect(await rooms.findById(ROOM_ID)).toBeNull();
    });

    it('leaves a tombstone (deletedAt set) visible to listChangedSince for sync', async () => {
      const useCase = new ArchiveRoom(
        rooms,
        fakeRoomReference(),
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );

      await useCase.execute({ centerCode: CENTER, roomId: ROOM_ID, updatedBy: USER });

      const changed = await rooms.listChangedSince(new Date('2026-07-30T00:00:00Z'));
      expect(changed).toHaveLength(1);
      expect(changed[0]?.id).toBe(ROOM_ID);
      expect(changed[0]?.deletedAt).toEqual(new Date('2026-07-30T09:00:00Z'));
      // The tombstone records *who* archived, so a delete-vs-edit conflict can attribute it.
      expect(changed[0]?.updatedBy).toBe(USER);
    });
  });

  describe('in-use guard', () => {
    it('throws RoomInUseError when an active session references the room', async () => {
      const useCase = new ArchiveRoom(
        rooms,
        fakeRoomReference([ROOM_ID]),
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );

      await expect(
        useCase.execute({ centerCode: CENTER, roomId: ROOM_ID, updatedBy: USER }),
      ).rejects.toBeInstanceOf(RoomInUseError);
      // The room is untouched — still alive.
      expect(await rooms.findById(ROOM_ID)).not.toBeNull();
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.rooms', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      const useCase = new ArchiveRoom(
        rooms,
        fakeRoomReference(),
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(planWithout),
      );

      await expect(
        useCase.execute({ centerCode: CENTER, roomId: ROOM_ID, updatedBy: USER }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(await rooms.findById(ROOM_ID)).not.toBeNull();
    });
  });

  describe('not found / tenant scoping', () => {
    it('throws RoomNotFoundError for an unknown id and touches nothing', async () => {
      const useCase = new ArchiveRoom(
        rooms,
        fakeRoomReference(),
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );
      const UNKNOWN = 'rom_00000000000000000000000099' as RoomId;

      await expect(
        useCase.execute({ centerCode: CENTER, roomId: UNKNOWN, updatedBy: USER }),
      ).rejects.toBeInstanceOf(RoomNotFoundError);
      // The seeded room is untouched.
      expect(await rooms.findById(ROOM_ID)).not.toBeNull();
    });

    it('throws RoomNotFoundError for a room in another center (no cross-tenant archive)', async () => {
      const useCase = new ArchiveRoom(
        rooms,
        fakeRoomReference(),
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );
      const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;

      await expect(
        useCase.execute({ centerCode: OTHER_CENTER, roomId: ROOM_ID, updatedBy: USER }),
      ).rejects.toBeInstanceOf(RoomNotFoundError);
      // The room stays alive in its real center.
      expect(await rooms.findById(ROOM_ID)).not.toBeNull();
    });
  });
});
