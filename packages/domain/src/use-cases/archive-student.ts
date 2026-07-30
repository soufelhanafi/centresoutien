import type { StudentRepository } from '../ports/student-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, UserId } from '../value-objects/ids';
import { StudentNotFoundError } from '../errors/student-errors';
import type { StudentId } from '../entities/student';

export type ArchiveStudentInput = {
  centerCode: CenterCode;
  id: StudentId;
  updatedBy: UserId;
};

/**
 * Archives a student — a soft delete (sets `deletedAt`), never a hard delete, so
 * the tombstone syncs and history is preserved. Gated by `core.students`. The
 * target is center-scoped (a foreign-tenant id reads as not-found), and the
 * deleter's `updatedBy` is stamped on the tombstone so the delete-vs-edit
 * conflict UI can show *who* archived, not just when. An unknown or
 * already-archived id raises {@link StudentNotFoundError}.
 */
export class ArchiveStudent {
  constructor(
    private readonly students: StudentRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ArchiveStudentInput): Promise<void> {
    this.plan.require('core.students');
    const existing = await this.students.findById(input.id);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new StudentNotFoundError(input.id);
    }
    await this.students.softDelete(input.id, this.clock.now(), input.updatedBy);
  }
}
