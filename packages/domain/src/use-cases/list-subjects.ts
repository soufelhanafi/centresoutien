import type { SubjectRepository } from '../ports/subject-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { Subject } from '../entities/subject';

/**
 * Which slice of a center's subjects to return. Both exclude tombstones — the
 * axis here is the `active` flag, not soft-delete: `'active'` is the picker set
 * (only usable subjects), `'all'` also includes deactivated subjects for
 * name-resolution and management. (Contrast rooms/teachers, whose scope is
 * live-vs-archived tombstones.)
 */
export type SubjectScope = 'active' | 'all';

export type ListSubjectsInput = {
  centerCode: CenterCode;
  scope: SubjectScope;
};

/**
 * Lists a center's subjects for name resolution and the subject filter/pickers
 * (SOU-124). Gated by `core.subjects` (every plan; the guard still has one home).
 * `scope` selects the active picker set or every live subject. Ordering is
 * alphabetical by French name — a stable, locale-agnostic default the use case
 * owns, so it does not depend on adapter row order (the in-memory fake and SQLite
 * agree). Mirrors `ListRooms`. This is the lightweight name channel; the usage
 * counts live on the separate `ListSubjectsWithUsage`.
 */
export class ListSubjects {
  constructor(
    private readonly subjects: SubjectRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ListSubjectsInput): Promise<readonly Subject[]> {
    this.plan.require('core.subjects');
    const subjects =
      input.scope === 'active'
        ? await this.subjects.listActive(input.centerCode)
        : await this.subjects.listAll(input.centerCode);
    return [...subjects].sort((a, b) => a.name.fr.localeCompare(b.name.fr));
  }
}
