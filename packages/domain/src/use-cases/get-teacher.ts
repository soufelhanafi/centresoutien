import type { TeacherRepository } from '../ports/teacher-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { Teacher, TeacherId } from '../entities/teacher';

export type GetTeacherInput = { centerCode: CenterCode; id: TeacherId };

/**
 * Loads a single teacher by id for the detail sheet. Gated by `core.teachers`.
 * Returns `null` for an unknown or soft-deleted id — the repository read already
 * hides tombstones, so "archived" and "never existed" collapse to the same
 * not-found the UI renders.
 *
 * The result is **center-scoped**: a row whose `centerCode` differs from the
 * caller's is treated as not-found. On desktop the one-DB-per-center boundary
 * makes this redundant, but the domain is the portable core — the same use case
 * runs on the future shared-Postgres backend where an id alone is not a tenant
 * guard, so the check lives here, not in the adapter. Mirrors `GetParent`.
 */
export class GetTeacher {
  constructor(
    private readonly teachers: TeacherRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetTeacherInput): Promise<Teacher | null> {
    this.plan.require('core.teachers');
    const teacher = await this.teachers.findById(input.id);
    return teacher && teacher.centerCode === input.centerCode ? teacher : null;
  }
}
