import type { RoomInput } from '@centresoutien/domain';

/**
 * Presentation projection of a `Room` as it will cross the IPC boundary — the
 * sync envelope (version, deviceOrigin, updatedBy…) stripped and `Date`s
 * serialized to strings, exactly like `StudentView` (SOU-39). The renderer never
 * handles the raw domain entity.
 *
 * This is a **renderer-owned** shape for now: the boundary DTO + `room.*`
 * channels are SOU-33's deliverable (see `rooms-gateway.ts`). When SOU-33
 * publishes a `roomViewSchema` in `shared/ipc/contract`, re-alias this type to
 * that DTO so the two can never drift — a one-line change with no UI impact.
 *
 * `sessionCount` is the number of active weekly sessions in the room; it is
 * `null` until the Sessions module lands (SOU-53), so the table shows a neutral
 * "—" placeholder rather than a fabricated count.
 */
export type RoomView = {
  readonly id: string;
  name: string;
  capacity: number;
  sessionCount: number | null;
  archived: boolean;
  createdAt: string;
};

/** The editable fields when creating or editing a room — the domain's own schema. */
export type { RoomInput };

/** A room's lifecycle state; the list is queried one state at a time. */
export type RoomStatus = 'active' | 'archived';

/** List query parameters. `status` selects the active list or the archived view. */
export type RoomListFilter = {
  readonly status: RoomStatus;
};
