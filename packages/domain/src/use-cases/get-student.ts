import type { StudentRepository } from '../ports/student-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { Student, StudentId } from '../entities/student';

export type GetStudentInput = { id: StudentId };

/**
 * Loads a single student by id for the detail screen. Gated by `core.students`.
 * Returns `null` for an unknown or soft-deleted id — the repository read already
 * hides tombstones, so "archived" and "never existed" collapse to the same
 * not-found the UI renders.
 */
export class GetStudent {
  constructor(
    private readonly students: StudentRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetStudentInput): Promise<Student | null> {
    this.plan.require('core.students');
    return this.students.findById(input.id);
  }
}
