import type { RoomInput, RoomListFilter, RoomView } from './room-view';
import { mockRoomsGateway } from './mock-rooms-gateway';

/**
 * The seam the Room UI depends on (Dependency Inversion). Hooks call this
 * interface, never `window.api` directly, so the concrete adapter is swappable
 * in one place with no change to any component.
 *
 * ## Contract status (SOU-34 frontend ↔ SOU-33 data)
 *
 * The `room.list / create / update / archive / restore` channels — and their
 * SQLite-backed IPC handlers — are SOU-33's deliverable and are **not published
 * yet**. Until they are, the active gateway is the in-memory
 * {@link mockRoomsGateway}, so the full UI (active/archived lists, create, edit,
 * archive, restore) runs end-to-end in both locales against this same interface.
 *
 * When SOU-33 lands, add an `IpcRoomsGateway implements RoomsGateway` (a thin
 * wrapper over `window.api.invoke('room.*')`, mirroring `ipc-students-gateway`)
 * and swap the one line below — no hook or component changes.
 */
export interface RoomsGateway {
  list(filter: RoomListFilter): Promise<readonly RoomView[]>;
  create(input: RoomInput): Promise<RoomView>;
  update(id: string, input: RoomInput): Promise<RoomView>;
  archive(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}

/** The active gateway. Swap to the IPC adapter once SOU-33 publishes its channels. */
export const roomsGateway: RoomsGateway = mockRoomsGateway;
