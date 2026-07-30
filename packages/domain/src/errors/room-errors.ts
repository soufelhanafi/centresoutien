import { DomainError } from './plan-errors';
import type { RoomId } from '../entities/room';

/**
 * Thrown when archiving (soft-deleting) a Room that is still referenced by at
 * least one active weekly session. The `ArchiveRoom` use case detects this via
 * the `RoomReferencePort` and rejects with this typed error so the renderer can
 * map it to a localized `errors.*` message and steer the user to reassign the
 * sessions first, rather than silently orphaning a live schedule.
 */
export class RoomInUseError extends DomainError {
  constructor(readonly roomId: RoomId) {
    super(`Room "${roomId}" cannot be archived while an active session references it.`);
  }
}

/**
 * Thrown when an archive targets a room id that has no live row in the current
 * center — unknown, already soft-deleted, or belonging to another center. The
 * renderer resolves the stable `room-not-found` code via `t(\`errors.${code}\`)`;
 * the domain stays i18n-agnostic. Mirrors `StudentNotFoundError` so the two
 * archive use cases behave consistently and neither silently no-ops.
 */
export class RoomNotFoundError extends DomainError {
  readonly code = 'room-not-found';

  constructor(readonly roomId: RoomId) {
    super(`No live room with id "${roomId}".`);
  }
}
