import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from '../entities/envelope';
import type { ParentId } from '../entities/parent';
import type { SoftDeletableRepository } from '../repositories/soft-deletable';

/**
 * ⚠️ DECLARED CONTRACT ONLY — NOT IMPLEMENTED IN SOU-40.
 *
 * This file publishes the *shape* of the student↔guardian link so the future
 * link/unlink use case and the SOU-42 UI can contract against it now. SOU-40
 * deliberately ships **no join-table migration, no SQLite adapter, and no use
 * case** for this: the Student domain (SOU-38) is being built on a parallel
 * branch and owns `StudentId`. The link lands as its own commit once SOU-38
 * merges — at which point the `StudentIdRef` alias below is deleted and the real
 * `StudentId` from the Student entity is imported in its place.
 */

/**
 * Forward reference to the Student id. Its canonical branded type is owned by
 * SOU-38; this local alias exists ONLY so this contract compiles ahead of that
 * merge. The brand string is identical (`'StudentId'`), so the two are
 * structurally interchangeable and no call site changes when SOU-38 lands —
 * simply repoint this import.
 */
type StudentIdRef = Brand<string, 'StudentId'>;

/** ULID id prefix for the student↔parent link: `spl_01HW…`. */
export const STUDENT_PARENT_LINK_ID_PREFIX = 'spl';

export type StudentParentLinkId = Brand<string, 'StudentParentLinkId'>;

/**
 * The many-to-many join between a Student and a Parent/guardian. A student may
 * have several guardians (father, mother, tutor); a guardian may cover several
 * students (siblings). Carries the full sync envelope like any other row and is
 * soft-deleted (unlinking sets `deletedAt`, never a hard delete). `isPrimary`
 * marks the first-contact guardian for invoices and notifications.
 */
export type StudentParentLink = EntityEnvelope & {
  readonly id: StudentParentLinkId;
  readonly studentId: StudentIdRef;
  readonly parentId: ParentId;
  isPrimary: boolean;
};

/**
 * Persistence port for the student↔parent link. Declared here for the contract;
 * its SQLite adapter and the LinkStudentParent / UnlinkStudentParent use cases
 * arrive with the SOU-38 follow-up. Inherits soft-delete semantics and adds the
 * two directional lookups the UI needs.
 */
export interface StudentParentLinkRepository
  extends SoftDeletableRepository<StudentParentLinkId, StudentParentLink> {
  listByStudent(studentId: StudentIdRef): Promise<readonly StudentParentLink[]>;
  listByParent(parentId: ParentId): Promise<readonly StudentParentLink[]>;
}
