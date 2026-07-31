import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { Teacher, TeacherId } from '../entities/teacher';
import type { CenterCode } from '../value-objects/ids';

/**
 * Persistence port for Teachers. Inherits the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`); reads exclude
 * tombstones, and there is no hard delete.
 *
 * Adds `findByNaturalKey` — the exact-match lookup the parents-first
 * duplicate-matching hierarchy uses to detect a probable duplicate at write and
 * sync time (phone-anchored, like Parent). It is a matching aid, not a uniqueness
 * gate at the domain level: the use case decides whether a hit is a rejection or
 * a legitimate second record.
 *
 * Adds `countActive` — the live headcount the plan `maxTeachers` limit checks
 * against — and `listActive` — every live (non-tombstoned) teacher of the center,
 * for the list screen. Search/sort are applied by the `ListTeachers` use case, not
 * here: the port stays a dumb tenant-scoped read, mirroring `StudentRepository`.
 */
export interface TeacherRepository extends SoftDeletableRepository<TeacherId, Teacher> {
  /** The single live teacher whose immutable naturalKey matches, or null. */
  findByNaturalKey(naturalKey: string): Promise<Teacher | null>;
  /** The live teacher count the `maxTeachers` plan limit checks against. */
  countActive(centerCode: CenterCode): Promise<number>;
  /** Every live teacher of the center, unfiltered and unsorted. */
  listActive(centerCode: CenterCode): Promise<readonly Teacher[]>;
}
