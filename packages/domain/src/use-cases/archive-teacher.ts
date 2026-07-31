import type { TeacherRepository } from '../ports/teacher-repository';
import type { TeacherReferencePort } from '../ports/teacher-reference';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, UserId } from '../value-objects/ids';
import { TeacherInUseError, TeacherNotFoundError } from '../errors/people-errors';
import type { TeacherId } from '../entities/teacher';

export type ArchiveTeacherInput = {
  centerCode: CenterCode;
  id: TeacherId;
  updatedBy: UserId;
};

/**
 * Archives (soft-deletes) a teacher — sets `deletedAt`, never a hard delete, so
 * the tombstone syncs and history is preserved. Gated by `core.teachers`. The
 * target is center-scoped: the teacher is loaded first, and an unknown,
 * already-archived, or foreign-center id raises a typed {@link TeacherNotFoundError}
 * before anything is touched (mirrors `ArchiveRoom` / `ArchiveParent`). It then
 * enforces the ticket's in-use invariant: a teacher still referenced by any active
 * group, session, or payroll rule cannot be archived — the guard consults the
 * {@link TeacherReferencePort} and rejects with a typed {@link TeacherInUseError}.
 * (Until Groups/payroll land, the injected reference stub reports "never
 * referenced", so the guard is a fully-tested seam that never fires yet.) When the
 * teacher is free it is soft-deleted; the delete timestamp comes from the injected
 * `Clock` (UTC), and the deleter's `updatedBy` is stamped on the tombstone so a
 * delete-vs-edit conflict can show *who* archived, not just when.
 */
export class ArchiveTeacher {
  constructor(
    private readonly teachers: TeacherRepository,
    private readonly references: TeacherReferencePort,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ArchiveTeacherInput): Promise<void> {
    this.plan.require('core.teachers');

    const existing = await this.teachers.findById(input.id);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new TeacherNotFoundError(input.id);
    }

    if (await this.references.hasReferencesForTeacher(input.id)) {
      throw new TeacherInUseError(input.id);
    }

    await this.teachers.softDelete(input.id, this.clock.now(), input.updatedBy);
  }
}
