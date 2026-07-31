import type { SubjectRepository } from '../ports/subject-repository';
import type { SubjectReferencePort } from '../ports/subject-reference';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { SubjectId } from '../entities/subject';
import type { CenterCode, UserId } from '../value-objects/ids';
import { SubjectInUseError, SubjectNotFoundError } from '../errors/subject-errors';

export type ArchiveSubjectInput = {
  centerCode: CenterCode;
  subjectId: SubjectId;
  updatedBy: UserId;
};

/**
 * Archives (soft-deletes) a Subject. Gated by `core.subjects`. The target is
 * center-scoped: the subject is loaded first, and an unknown, already-archived, or
 * foreign-center id raises a typed {@link SubjectNotFoundError} before anything is
 * touched — so a stale or wrong-tenant id from the renderer can never silently
 * no-op as a success (mirrors `ArchiveRoom`). It then enforces the ticket's in-use
 * invariant: a subject still referenced by any active Group, Session, or Formula
 * cannot be archived — the guard consults the `SubjectReferencePort` and rejects
 * with a typed {@link SubjectInUseError}. When the subject is free it is
 * soft-deleted (tombstone), never hard-deleted, so the row still syncs. The delete
 * timestamp comes from the injected `Clock` (UTC), never `new Date()`, and the
 * deleter's `updatedBy` is stamped on the tombstone so a delete-vs-edit conflict
 * can show *who* archived, not just when.
 */
export class ArchiveSubject {
  constructor(
    private readonly subjects: SubjectRepository,
    private readonly references: SubjectReferencePort,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ArchiveSubjectInput): Promise<void> {
    this.plan.require('core.subjects');

    const existing = await this.subjects.findById(input.subjectId);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new SubjectNotFoundError(input.subjectId);
    }

    if (await this.references.isSubjectInUse(input.subjectId)) {
      throw new SubjectInUseError(input.subjectId);
    }

    await this.subjects.softDelete(input.subjectId, this.clock.now(), input.updatedBy);
  }
}
