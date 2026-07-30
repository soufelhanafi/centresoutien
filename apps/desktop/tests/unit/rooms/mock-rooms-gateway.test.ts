import { describe, expect, it } from 'vitest';
import type { RoomInput } from '@centresoutien/domain';
import { MockRoomsGateway } from '../../../src/renderer/lib/rooms/mock-rooms-gateway';

function input(overrides: Partial<RoomInput> = {}): RoomInput {
  return { name: 'Salle 3', capacity: 12, ...overrides };
}

describe('MockRoomsGateway', () => {
  it('lists the seeded active rooms sorted by name, archived list empty', async () => {
    const gateway = new MockRoomsGateway();
    const active = await gateway.list({ status: 'active' });
    expect(active.map((r) => r.name)).toEqual(['Salle 1', 'Salle 2']);
    expect(await gateway.list({ status: 'archived' })).toHaveLength(0);
  });

  it('seeds a null session count so the UI shows the "—" placeholder', async () => {
    const gateway = new MockRoomsGateway();
    const [room] = await gateway.list({ status: 'active' });
    expect(room?.sessionCount).toBeNull();
  });

  it('creates a room that then appears in the active list', async () => {
    const gateway = new MockRoomsGateway();
    const created = await gateway.create(input({ name: 'Salle B', capacity: 20 }));
    expect(created.archived).toBe(false);
    expect(created.capacity).toBe(20);
    const active = await gateway.list({ status: 'active' });
    expect(active.map((r) => r.name)).toContain('Salle B');
  });

  it('updates name and capacity while keeping the same id and lifecycle', async () => {
    const gateway = new MockRoomsGateway();
    const created = await gateway.create(input());
    const updated = await gateway.update(created.id, input({ name: 'Salle rénovée', capacity: 25 }));
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Salle rénovée');
    expect(updated.capacity).toBe(25);
    expect(updated.archived).toBe(false);
  });

  it('archives a room so it leaves the active list and joins the archived list', async () => {
    const gateway = new MockRoomsGateway();
    const created = await gateway.create(input({ name: 'Salle temporaire' }));
    await gateway.archive(created.id);
    expect((await gateway.list({ status: 'active' })).map((r) => r.name)).not.toContain('Salle temporaire');
    const archived = await gateway.list({ status: 'archived' });
    expect(archived.map((r) => r.name)).toContain('Salle temporaire');
    expect(archived.every((r) => r.archived)).toBe(true);
  });

  it('restores an archived room back to the active list', async () => {
    const gateway = new MockRoomsGateway();
    const created = await gateway.create(input({ name: 'Salle réouverte' }));
    await gateway.archive(created.id);
    await gateway.restore(created.id);
    expect((await gateway.list({ status: 'archived' })).map((r) => r.name)).not.toContain('Salle réouverte');
    expect((await gateway.list({ status: 'active' })).map((r) => r.name)).toContain('Salle réouverte');
  });
});
