import type { RoomInput, RoomListFilter, RoomView } from './room-view';

/**
 * In-memory stand-in for the not-yet-published Room channels (see
 * `rooms-gateway.ts` for the contract requested from SOU-33). It lets the full
 * UI — active/archived lists, create, edit, archive, restore — run end-to-end in
 * both locales before the SQLite-backed IPC handlers exist. Deliberately not a
 * React store: it models the server, so the UI drives it through TanStack Query
 * exactly as it will the real adapter.
 *
 * `sessionCount` is always `null` here — the Sessions module is SOU-53 — so the
 * table renders the neutral "—" placeholder rather than a fabricated number.
 */

const SEED: readonly RoomView[] = [
  {
    id: 'rom_01HW0SEED0000000000000001',
    name: 'Salle 1',
    capacity: 18,
    sessionCount: null,
    archived: false,
    createdAt: '2026-02-01T09:00:00.000Z',
  },
  {
    id: 'rom_01HW0SEED0000000000000002',
    name: 'Salle 2',
    capacity: 15,
    sessionCount: null,
    archived: false,
    createdAt: '2026-02-03T10:30:00.000Z',
  },
];

function newId(): string {
  const rand = Math.random().toString(36).slice(2).toUpperCase().padEnd(20, '0');
  return `rom_MOCK${rand.slice(0, 22)}`;
}

function toView(id: string, input: RoomInput, createdAt: string, archived: boolean): RoomView {
  return { id, name: input.name, capacity: input.capacity, sessionCount: null, archived, createdAt };
}

export class MockRoomsGateway {
  private readonly rooms = new Map<string, RoomView>(SEED.map((r) => [r.id, r]));

  async list(filter: RoomListFilter): Promise<readonly RoomView[]> {
    const wantArchived = filter.status === 'archived';
    return [...this.rooms.values()]
      .filter((r) => r.archived === wantArchived)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async create(input: RoomInput): Promise<RoomView> {
    const room = toView(newId(), input, new Date().toISOString(), false);
    this.rooms.set(room.id, room);
    return room;
  }

  async update(id: string, input: RoomInput): Promise<RoomView> {
    const current = this.rooms.get(id);
    if (!current) throw new Error(`unknown room ${id}`);
    const updated = toView(id, input, current.createdAt, current.archived);
    this.rooms.set(id, updated);
    return updated;
  }

  async archive(id: string): Promise<void> {
    const current = this.rooms.get(id);
    if (current) this.rooms.set(id, { ...current, archived: true });
  }

  async restore(id: string): Promise<void> {
    const current = this.rooms.get(id);
    if (current) this.rooms.set(id, { ...current, archived: false });
  }
}

export const mockRoomsGateway = new MockRoomsGateway();
