import type { RoomInput } from '@centresoutien/domain';
import type { RoomDto } from '../../../shared/ipc/contract';

/**
 * Presentation projection of a `Room` as it crosses the IPC boundary. This is the
 * published boundary DTO (`roomViewSchema` in `shared/ipc/contract`, SOU-33) — the
 * sync envelope stripped and `Date`s serialized — extended with `sessionCount`.
 * Re-aliasing the DTO (rather than re-declaring its fields) keeps the two from
 * drifting.
 *
 * `sessionCount` is the number of active weekly sessions in the room; it is `null`
 * until the Sessions module lands (SOU-53), so the table shows a neutral "—"
 * placeholder rather than a fabricated count.
 */
export type RoomView = RoomDto & {
  sessionCount: number | null;
};

/** The editable fields when creating or editing a room — the domain's own schema. */
export type { RoomInput };

/** A room's lifecycle state; the list is queried one state at a time. */
export type RoomStatus = 'active' | 'archived';

/** List query parameters. `status` selects the active list or the archived view. */
export type RoomListFilter = {
  readonly status: RoomStatus;
};
