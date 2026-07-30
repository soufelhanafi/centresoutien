import { describe, it, expect, beforeEach } from 'vitest';
import { RestoreRoom } from '../../../src/use-cases/restore-room';
import { CreateRoom } from '../../../src/use-cases/create-room';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError, PlanLimitExceededError } from '../../../src/errors/plan-errors';
import { RoomNotFoundError } from '../../../src/errors/room-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Room, RoomId } from '../../../src/entities/room';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryRoomRepository } from '../fakes/in-memory-room-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const RESTORER = 'usr_00000000000000000000000002' as UserId;
const ROOM_ID = 'rom_00000000000000000000000001' as RoomId;

function seededRoom(id: RoomId = ROOM_ID, centerCode: CenterCode = CENTER): Room {
  return {
    id,
    ...newEnvelope(
      { centerCode, deviceOrigin: DEVICE, updatedBy: USER },
      fakeClock('2026-07-29T10:00:00Z'),
    ),
    name: 'Salle A',
    capacity: 20,
    active: true,
  };
}

describe('RestoreRoom', () => {
  let rooms: InMemoryRoomRepository;
  let useCase: RestoreRoom;

  beforeEach(async () => {
    rooms = new InMemoryRoomRepository();
    await rooms.save(seededRoom());
    await rooms.softDelete(ROOM_ID, new Date('2026-07-30T00:00:00Z'), USER);
    useCase = new RestoreRoom(rooms, fakeClock('2026-07-31T09:00:00Z'), new PlanPolicy(PLANS.essentiel));
  });

  describe('happy path', () => {
    it('clears the tombstone and bumps updatedAt/updatedBy so the room is live again', async () => {
      const restored = await useCase.execute({ centerCode: CENTER, roomId: ROOM_ID, updatedBy: RESTORER });

      expect(restored.deletedAt).toBeNull();
      expect(restored.updatedAt).toEqual(new Date('2026-07-31T09:00:00Z'));
      expect(restored.updatedBy).toBe(RESTORER);
      // Identity + provenance + version preserved.
      expect(restored.id).toBe(ROOM_ID);
      expect(restored.createdAt).toEqual(new Date('2026-07-29T10:00:00Z'));
      expect(restored.version).toBe(0);
      // Now readable through the live path.
      expect(await rooms.findById(ROOM_ID)).toEqual(restored);
    });
  });

  describe('not found', () => {
    it('throws RoomNotFoundError for a room that is already live (nothing to restore)', async () => {
      await useCase.execute({ centerCode: CENTER, roomId: ROOM_ID, updatedBy: RESTORER });
      await expect(
        useCase.execute({ centerCode: CENTER, roomId: ROOM_ID, updatedBy: RESTORER }),
      ).rejects.toBeInstanceOf(RoomNotFoundError);
    });

    it('throws RoomNotFoundError for an unknown id', async () => {
      await expect(
        useCase.execute({
          centerCode: CENTER,
          roomId: 'rom_00000000000000000000000099' as RoomId,
          updatedBy: RESTORER,
        }),
      ).rejects.toBeInstanceOf(RoomNotFoundError);
    });

    it('throws RoomNotFoundError for an archived room in another center', async () => {
      await expect(
        useCase.execute({ centerCode: OTHER_CENTER, roomId: ROOM_ID, updatedBy: RESTORER }),
      ).rejects.toBeInstanceOf(RoomNotFoundError);
      // Still archived in its real center.
      expect(await rooms.findById(ROOM_ID)).toBeNull();
      expect(await rooms.findArchivedById(ROOM_ID)).not.toBeNull();
    });
  });

  describe('maxRooms limit', () => {
    it('rejects a restore that would exceed the plan cap (Essentiel: 1 live room)', async () => {
      // Fill the single Essentiel slot with a different live room, then try to
      // restore the archived one — that would make 2 live rooms on a 1-room plan.
      // Seed the id generator well past ROOM_ID so the new room gets a distinct id
      // (fakeIds(1) would mint ROOM_ID itself and clobber the tombstone).
      const create = new CreateRoom(rooms, fakeClock(), fakeIds(500), new PlanPolicy(PLANS.essentiel));
      await create.execute({
        name: 'Salle B',
        capacity: 10,
        centerCode: CENTER,
        deviceOrigin: DEVICE,
        updatedBy: USER,
      });

      await expect(
        useCase.execute({ centerCode: CENTER, roomId: ROOM_ID, updatedBy: RESTORER }),
      ).rejects.toBeInstanceOf(PlanLimitExceededError);
      // The archived room is untouched — still a tombstone.
      expect(await rooms.findArchivedById(ROOM_ID)).not.toBeNull();
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.rooms', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      useCase = new RestoreRoom(rooms, fakeClock(), new PlanPolicy(planWithout));
      await expect(
        useCase.execute({ centerCode: CENTER, roomId: ROOM_ID, updatedBy: RESTORER }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });
  });
});
