import type { RoomInput, RoomListFilter, RoomView } from './room-view';
import { ipcRoomsGateway } from './ipc-rooms-gateway';

/**
 * The seam the Room UI depends on (Dependency Inversion). Hooks call this
 * interface, never `window.api` directly, so the concrete adapter is swappable
 * in one place with no change to any component.
 *
 * ## Contract status (SOU-34 frontend ↔ SOU-33 data)
 *
 * All five channels are now published (`room.list / create / update / archive /
 * restore`) with their SQLite-backed IPC handlers, so this ships against the real
 * {@link ipcRoomsGateway}. The in-memory `MockRoomsGateway` stays in the tree for
 * unit tests, which exercise the same interface without Electron.
 */
export interface RoomsGateway {
  list(filter: RoomListFilter): Promise<readonly RoomView[]>;
  create(input: RoomInput): Promise<RoomView>;
  update(id: string, input: RoomInput): Promise<RoomView>;
  archive(id: string): Promise<void>;
  restore(id: string): Promise<void>;
}

/** The active gateway: the real IPC adapter. Swapping it is this one line. */
export const roomsGateway: RoomsGateway = ipcRoomsGateway;
