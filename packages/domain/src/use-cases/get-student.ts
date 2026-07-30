import type { StudentRepository } from '../ports/student-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { Student, StudentId } from '../entities/student';

export type GetStudentInput = { centerCode: CenterCode; id: StudentId };

/**
 * Loads a single student by id for the detail screen. Gated by `core.students`.
 * Returns `null` for an unknown or soft-deleted id — the repository read already
 * hides tombstones, so "archived" and "never existed" collapse to the same
 * not-found the UI renders.
 *
 * The result is **center-scoped**: a row whose `centerCode` differs from the
 * caller's is treated as not-found. On desktop the one-DB-per-center boundary
 * makes this redundant, but the domain is the portable core — the same use case
 * runs on the future shared-Postgres backend where an id alone is not a tenant
 * guard, so the check lives here, not in the adapter.
 */
export class GetStudent {
  constructor(
    private readonly students: StudentRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetStudentInput): Promise<Student | null> {
    this.plan.require('core.students');
    const student = await this.students.findById(input.id);
    return student && student.centerCode === input.centerCode ? student : null;
  }
}
