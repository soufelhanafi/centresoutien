import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';

/** ULID id prefix for rooms: `rom_01HW…`. */
export const ROOM_ID_PREFIX = 'rom';

export type RoomId = Brand<string, 'RoomId'>;

/**
 * A physical room the center schedules sessions into, configured under the
 * every-plan `core.rooms` feature. `name` is a single plain string (a room label
 * like "Salle A" is not translated — unlike Subjects, which are bilingual).
 * `capacity` is the number of seats and is always ≥ 1 (enforced by the use case
 * via `roomInputSchema`). Soft-delete only: a room referenced by any active
 * weekly session cannot be archived — the `ArchiveRoom` use case rejects that
 * with `RoomInUseError`. Not people-like, so it carries no `naturalKey`.
 */
export type Room = EntityEnvelope & {
  readonly id: RoomId;
  name: string;
  capacity: number;
  active: boolean;
};
