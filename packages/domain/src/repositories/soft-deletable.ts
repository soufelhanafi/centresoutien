import type { EntityEnvelope } from '../entities/envelope';
import type { UserId } from '../value-objects/ids';

/**
 * Repository port for any soft-deletable entity (invariant 4). Reads exclude
 * tombstones by default; only the sync-facing `listChangedSince` returns them.
 * There is deliberately no `hardDelete` — deletes set `deletedAt`.
 */
export interface SoftDeletableRepository<TId extends string, T extends { id: TId } & EntityEnvelope> {
  save(entity: T): Promise<void>;
  /** Returns null for unknown or soft-deleted ids. */
  findById(id: TId): Promise<T | null>;
  /**
   * Tombstone the row: set `deletedAt` + `updatedAt` to `at` and record `by` as
   * `updatedBy`, so the conflict UI can show *who* deleted (not just when) on a
   * delete-vs-edit clash. A delete is a write like any other — it carries the actor.
   */
  softDelete(id: TId, at: Date, by: UserId): Promise<void>;
  /** Sync cursor query: rows updated strictly after `cursor`, tombstones included. */
  listChangedSince(cursor: Date): Promise<readonly T[]>;
}
