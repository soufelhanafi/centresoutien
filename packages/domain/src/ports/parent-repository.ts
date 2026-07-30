import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { Parent, ParentId } from '../entities/parent';
import type { CenterCode } from '../value-objects/ids';

/**
 * Persistence port for Parents/guardians. Inherits the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`); reads exclude
 * tombstones, and there is no hard delete.
 *
 * Adds `findByNaturalKey` — the exact-match lookup the parents-first
 * duplicate-matching hierarchy uses to detect a probable duplicate at write and
 * sync time. It is a matching aid, not a uniqueness gate: callers decide whether
 * a hit is an auto-merge, a flagged conflict, or a legitimate second record.
 *
 * Adds `listActive` — every live (non-tombstoned) guardian of the center, for
 * the list screen. Search/sort are applied by the `ListParents` use case, not
 * here: the port stays a dumb tenant-scoped read, mirroring `StudentRepository`.
 */
export interface ParentRepository extends SoftDeletableRepository<ParentId, Parent> {
  /** The single live parent whose immutable naturalKey matches, or null. */
  findByNaturalKey(naturalKey: string): Promise<Parent | null>;
  /** Every live guardian of the center, unfiltered and unsorted. */
  listActive(centerCode: CenterCode): Promise<readonly Parent[]>;
}
