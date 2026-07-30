import type { StudentRepository } from '../ports/student-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import { StudentNotFoundError } from '../errors/student-errors';
import type { StudentId } from '../entities/student';

export type ArchiveStudentInput = { id: StudentId };

/**
 * Archives a student — a soft delete (sets `deletedAt`), never a hard delete, so
 * the tombstone syncs and history is preserved. Gated by `core.students`. An
 * unknown or already-archived id raises {@link StudentNotFoundError} so the UI
 * can tell the user the row is gone rather than reporting a silent success.
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
    if (existing === null) {
      throw new StudentNotFoundError(input.id);
    }
    await this.students.softDelete(input.id, this.clock.now());
  }
}
