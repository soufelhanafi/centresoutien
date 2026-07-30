import { describe, it, expect, beforeEach } from 'vitest';
import { CreateRoom, type CreateRoomInput } from '../../../src/use-cases/create-room';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError, PlanLimitExceededError } from '../../../src/errors/plan-errors';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryRoomRepository } from '../fakes/in-memory-room-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

function validInput(overrides: Partial<CreateRoomInput> = {}): CreateRoomInput {
  return {
    name: '  Salle A ',
    capacity: 20,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

describe('CreateRoom', () => {
  let rooms: InMemoryRoomRepository;
  let useCase: CreateRoom;

  beforeEach(() => {
    rooms = new InMemoryRoomRepository();
    useCase = new CreateRoom(
      rooms,
      fakeClock('2026-07-29T10:00:00Z'),
      fakeIds(),
      new PlanPolicy(PLANS.essentiel),
    );
  });

  describe('happy path', () => {
    it('creates an active room with a prefixed id, trimmed name, capacity, and a fresh envelope', async () => {
      const room = await useCase.execute(validInput());

      expect(room.id).toMatch(/^rom_/);
      expect(room.name).toBe('Salle A');
      expect(room.capacity).toBe(20);
      expect(room.active).toBe(true);
      expect(room.centerCode).toBe(CENTER);
      expect(room.deviceOrigin).toBe(DEVICE);
      expect(room.updatedBy).toBe(USER);
      expect(room.createdAt).toEqual(new Date('2026-07-29T10:00:00Z'));
      expect(room.updatedAt).toEqual(room.createdAt);
      expect(room.deletedAt).toBeNull();
      expect(room.version).toBe(0);
    });

    it('persists the room so it can be read back by id', async () => {
      const room = await useCase.execute(validInput());
      expect(await rooms.findById(room.id)).toEqual(room);
    });

    it('accepts the minimum capacity of 1', async () => {
      const room = await useCase.execute(validInput({ capacity: 1 }));
      expect(room.capacity).toBe(1);
    });
  });

  describe('capacity invariant', () => {
    it('rejects a capacity below 1', async () => {
      await expect(useCase.execute(validInput({ capacity: 0 }))).rejects.toThrow();
      expect(rooms.all()).toHaveLength(0);
    });

    it('rejects a negative capacity', async () => {
      await expect(useCase.execute(validInput({ capacity: -3 }))).rejects.toThrow();
      expect(rooms.all()).toHaveLength(0);
    });

    it('rejects a non-integer capacity', async () => {
      await expect(useCase.execute(validInput({ capacity: 1.5 }))).rejects.toThrow();
      expect(rooms.all()).toHaveLength(0);
    });
  });

  describe('validation', () => {
    it('rejects a blank name', async () => {
      await expect(useCase.execute(validInput({ name: '   ' }))).rejects.toThrow();
      expect(rooms.all()).toHaveLength(0);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.rooms', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      useCase = new CreateRoom(rooms, fakeClock(), fakeIds(), new PlanPolicy(planWithout));

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(rooms.all()).toHaveLength(0);
    });
  });

  describe('maxRooms limit', () => {
    it('rejects the create that would exceed the plan cap (Essentiel: 1 room)', async () => {
      // fakeIds() yields distinct ids per call, so the first create is a real row.
      await useCase.execute(validInput({ name: 'Salle A' }));

      await expect(useCase.execute(validInput({ name: 'Salle B' }))).rejects.toBeInstanceOf(
        PlanLimitExceededError,
      );
      expect(rooms.all()).toHaveLength(1);
    });

    it('counts only live rooms — an archived room frees a slot under the cap', async () => {
      const first = await useCase.execute(validInput({ name: 'Salle A' }));
      await rooms.softDelete(first.id, new Date('2026-07-30T00:00:00Z'), USER);

      // With the only room tombstoned, the live count is 0 again — create succeeds.
      const second = await useCase.execute(validInput({ name: 'Salle B' }));
      expect(second.name).toBe('Salle B');
      expect(await rooms.countActive(CENTER)).toBe(1);
    });

    it('does not cap higher tiers the same way (Pro: 5 rooms)', async () => {
      useCase = new CreateRoom(rooms, fakeClock(), fakeIds(), new PlanPolicy(PLANS.pro));
      for (let i = 0; i < 5; i += 1) {
        await useCase.execute(validInput({ name: `Salle ${i}` }));
      }
      await expect(useCase.execute(validInput({ name: 'Salle 6' }))).rejects.toBeInstanceOf(
        PlanLimitExceededError,
      );
      expect(rooms.all()).toHaveLength(5);
    });
  });
});
