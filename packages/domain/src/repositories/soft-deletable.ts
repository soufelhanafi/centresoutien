import type { EntityEnvelope } from '../entities/envelope';

/**
 * Repository port for any soft-deletable entity (invariant 4). Reads exclude
 * tombstones by default; only the sync-facing `listChangedSince` returns them.
 * There is deliberately no `hardDelete` — deletes set `deletedAt`.
 */
export interface SoftDeletableRepository<TId extends string, T extends { id: TId } & EntityEnvelope> {
  save(entity: T): Promise<void>;
  /** Returns null for unknown or soft-deleted ids. */
  findById(id: TId): Promise<T | null>;
  softDelete(id: TId, at: Date): Promise<void>;
  /** Sync cursor query: rows updated strictly after `cursor`, tombstones included. */
  listChangedSince(cursor: Date): Promise<readonly T[]>;
}
