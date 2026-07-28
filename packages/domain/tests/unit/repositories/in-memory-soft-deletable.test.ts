import { describe, expect, it, beforeEach } from 'vitest';
import { InMemorySoftDeletableRepository } from '../fakes/in-memory-soft-deletable';
import { newEnvelope } from '../../../src/entities/envelope';
import type { EntityEnvelope } from '../../../src/entities/envelope';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { fakeClock } from '../fakes/clock';

type Room = EntityEnvelope & { readonly id: string; name: string };

class Rooms extends InMemorySoftDeletableRepository<string, Room> {}

const center = 'CS-CASA-001' as CenterCode;
const device = 'dev_1' as DeviceId;
const user = 'usr_1' as UserId;

function room(id: string, name: string, at: string): Room {
  const clock = fakeClock(at);
  return { id, name, ...newEnvelope({ centerCode: center, deviceOrigin: device, updatedBy: user }, clock) };
}

describe('InMemorySoftDeletableRepository', () => {
  let rooms: Rooms;
  beforeEach(() => {
    rooms = new Rooms();
  });

  it('saves and finds an active row', async () => {
    const r = room('room_1', 'Salle A', '2026-01-01T00:00:00Z');
    await rooms.save(r);
    expect(await rooms.findById('room_1')).toEqual(r);
  });

  it('returns null for an unknown id', async () => {
    expect(await rooms.findById('nope')).toBeNull();
  });

  it('excludes soft-deleted rows from findById by default', async () => {
    await rooms.save(room('room_1', 'Salle A', '2026-01-01T00:00:00Z'));
    await rooms.softDelete('room_1', new Date('2026-02-01T00:00:00Z'));
    expect(await rooms.findById('room_1')).toBeNull();
  });

  it('does not mutate the caller’s object on save (defensive clone)', async () => {
    const r = room('room_1', 'Salle A', '2026-01-01T00:00:00Z');
    await rooms.save(r);
    r.name = 'MUTATED';
    const found = await rooms.findById('room_1');
    expect(found?.name).toBe('Salle A');
  });

  it('listChangedSince returns rows updated after the cursor, tombstones included, sorted', async () => {
    await rooms.save(room('room_1', 'A', '2026-01-01T00:00:00Z'));
    await rooms.save(room('room_2', 'B', '2026-03-01T00:00:00Z'));
    await rooms.softDelete('room_1', new Date('2026-04-01T00:00:00Z'));

    const changed = await rooms.listChangedSince(new Date('2026-02-01T00:00:00Z'));
    expect(changed.map((r) => r.id)).toEqual(['room_2', 'room_1']); // room_1 now tombstoned at 04-01
    expect(changed[1]?.deletedAt).not.toBeNull();
  });
});
