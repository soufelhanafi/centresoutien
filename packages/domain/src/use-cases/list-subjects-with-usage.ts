import type { SubjectRepository, SubjectUsage } from '../ports/subject-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';

export type ListSubjectsWithUsageInput = { centerCode: CenterCode };

/**
 * Lists a center's subjects each paired with its in-use reference count for the
 * SOU-47 CRUD table, so a row can enable or disable its archive action without a
 * second round-trip (`canDelete === inUseCount === 0`), plus the named breakdown
 * of what's referencing it (`references`, SOU-135) for the delete-blocked modal.
 * Gated by `core.subjects`.
 *
 * A thin query use case over the existing `SubjectRepository.listWithUsage`
 * (built in SOU-46, extended in SOU-135): the repository already resolves the
 * counts and the breakdown in a single batch read (never N+1), so this adds only
 * the plan gate and the seam. Kept **separate** from `ListSubjects` —
 * name-resolution consumers must not pay for the usage counts. "In use" today
 * means active groups; sessions and formulas join the count and the breakdown
 * behind this stable contract once they reference subjects.
 */
export class ListSubjectsWithUsage {
  constructor(
    private readonly subjects: SubjectRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ListSubjectsWithUsageInput): Promise<readonly SubjectUsage[]> {
    this.plan.require('core.subjects');
    return this.subjects.listWithUsage(input.centerCode);
  }
}
