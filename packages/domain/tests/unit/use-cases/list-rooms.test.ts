import { describe, it, expect, beforeEach } from 'vitest';
import { ListRooms } from '../../../src/use-cases/list-rooms';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Room, RoomId } from '../../../src/entities/room';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryRoomRepository } from '../fakes/in-memory-room-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

let seq = 0;
function seededRoom(name: string, centerCode: CenterCode = CENTER): Room {
  seq += 1;
  return {
    id: `rom_${String(seq).padStart(26, '0')}` as RoomId,
    ...newEnvelope({ centerCode, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock()),
    name,
    capacity: 20,
    active: true,
  };
}

describe('ListRooms', () => {
  let rooms: InMemoryRoomRepository;
  let useCase: ListRooms;

  beforeEach(() => {
    rooms = new InMemoryRoomRepository();
    useCase = new ListRooms(rooms, new PlanPolicy(PLANS.essentiel));
  });

  it('returns live rooms of the center, alphabetically by name, for the active scope', async () => {
    await rooms.save(seededRoom('Salle C'));
    await rooms.save(seededRoom('Salle A'));
    await rooms.save(seededRoom('Salle B'));

    const listed = await useCase.execute({ centerCode: CENTER, scope: 'active' });
    expect(listed.map((r) => r.name)).toEqual(['Salle A', 'Salle B', 'Salle C']);
  });

  it('excludes tombstoned rooms from the active scope and other centers', async () => {
    await rooms.save(seededRoom('Salle A'));
    const archived = seededRoom('Salle Z');
    await rooms.save(archived);
    await rooms.softDelete(archived.id, new Date('2026-07-30T00:00:00Z'), USER);
    await rooms.save(seededRoom('Salle Étrangère', OTHER_CENTER));

    const listed = await useCase.execute({ centerCode: CENTER, scope: 'active' });
    expect(listed.map((r) => r.name)).toEqual(['Salle A']);
  });

  it('returns only tombstoned rooms of the center for the archived scope', async () => {
    await rooms.save(seededRoom('Salle A'));
    const gone1 = seededRoom('Salle Y');
    const gone2 = seededRoom('Salle X');
    await rooms.save(gone1);
    await rooms.save(gone2);
    await rooms.softDelete(gone1.id, new Date('2026-07-30T00:00:00Z'), USER);
    await rooms.softDelete(gone2.id, new Date('2026-07-30T00:00:00Z'), USER);

    const listed = await useCase.execute({ centerCode: CENTER, scope: 'archived' });
    expect(listed.map((r) => r.name)).toEqual(['Salle X', 'Salle Y']);
  });

  it('throws PlanFeatureUnavailableError when the plan lacks core.rooms', async () => {
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(),
      limits: PLANS.essentiel.limits,
    };
    useCase = new ListRooms(rooms, new PlanPolicy(planWithout));
    await expect(
      useCase.execute({ centerCode: CENTER, scope: 'active' }),
    ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
  });
});
