import type { StudentRepository } from '../ports/student-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { Student } from '../entities/student';
import type { ParentId } from '../entities/parent';

export type ListParentChildrenInput = {
  centerCode: CenterCode;
  parentId: ParentId;
};

/**
 * Lists every live student in the center linked to the given guardian — the
 * "linked children in one place" panel of the parent detail sheet (SOU-41).
 * Gated by `core.parents`: this is the guardian-centric view, reached only from
 * the parents feature, so it shares that feature's gate rather than
 * `core.students`.
 *
 * Center-scoped through the repository read (`listByGuardian` filters by
 * `centerCode`), so a guardian id from another tenant yields an empty list, never
 * a cross-center leak. Ordering is alphabetical by French name — the same stable
 * default `ListStudents` uses; the renderer may re-sort per active locale.
 */
export class ListParentChildren {
  constructor(
    private readonly students: StudentRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ListParentChildrenInput): Promise<readonly Student[]> {
    this.plan.require('core.parents');
    const children = await this.students.listByGuardian(input.centerCode, input.parentId);
    return [...children].sort((a, b) => a.name.fr.localeCompare(b.name.fr));
  }
}
