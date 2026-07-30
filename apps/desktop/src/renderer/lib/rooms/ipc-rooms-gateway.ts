import type { RoomInput, RoomListFilter, RoomView } from './room-view';
import type { RoomsGateway } from './rooms-gateway';

/**
 * The real {@link RoomsGateway}: maps each method onto its typed IPC channel
 * (SOU-33). No business logic — the domain use cases behind the channels own it.
 *
 * Two boundary shims:
 * - The `roomViewSchema` DTO carries no session count (that needs the Sessions
 *   module, SOU-53), so every view is mapped with `sessionCount: null` and the
 *   table shows the neutral "—" placeholder.
 * - `room.create` echoes only the new id and rooms has no `get` channel, so the
 *   fresh room is read back from the active list — the same projection as every
 *   other read, no fabricated fields.
 */
class IpcRoomsGateway implements RoomsGateway {
  async list(filter: RoomListFilter): Promise<readonly RoomView[]> {
    const { rooms } = await window.api.invoke('room.list', { scope: filter.status });
    return rooms.map((room) => ({ ...room, sessionCount: null }));
  }

  async create(input: RoomInput): Promise<RoomView> {
    const { id } = await window.api.invoke('room.create', input);
    const created = (await this.list({ status: 'active' })).find((room) => room.id === id);
    if (created === undefined) {
      throw new Error(`room ${id} was created but could not be read back`);
    }
    return created;
  }

  async update(id: string, input: RoomInput): Promise<RoomView> {
    const { room } = await window.api.invoke('room.update', { ...input, id });
    return { ...room, sessionCount: null };
  }

  async archive(id: string): Promise<void> {
    await window.api.invoke('room.archive', { id });
  }

  async restore(id: string): Promise<void> {
    await window.api.invoke('room.restore', { id });
  }
}

export const ipcRoomsGateway: RoomsGateway = new IpcRoomsGateway();
