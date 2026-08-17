import type { NiveauRepository, NiveauUsage } from '../ports/niveau-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';

export type ListNiveauxWithUsageInput = { centerCode: CenterCode };

/**
 * Lists a center's niveaux each paired with its in-use reference count for the
 * SOU-260 manage screen, so a row can enable or disable its archive action
 * without a second round-trip (`canDelete === inUseCount === 0`), plus the named
 * breakdown of what's referencing it (`references`) for the delete-blocked
 * modal. Gated by `core.niveaux`.
 *
 * A thin query use case over `NiveauRepository.listWithUsage` (the repository
 * resolves the counts and the breakdown in a single batch read — never N+1).
 * Kept **separate** from `ListNiveaux` — name-resolution consumers must not pay
 * for the usage counts. "In use" means live Students, Groups, or Teachers
 * referencing the niveau.
 */
export class ListNiveauxWithUsage {
  constructor(
    private readonly niveaux: NiveauRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ListNiveauxWithUsageInput): Promise<readonly NiveauUsage[]> {
    this.plan.require('core.niveaux');
    return this.niveaux.listWithUsage(input.centerCode);
  }
}
