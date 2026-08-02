import type { FormulaRepository } from '../ports/formula-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { Formula } from '../entities/formula';

/**
 * Which slice of a center's formulas to return. Both exclude tombstones — the
 * axis here is the `active` flag, not soft-delete: `'active'` is the
 * new-subscription picker set, `'all'` also includes deactivated formulas for
 * the SOU-62 CRUD table. Mirrors `SubjectScope`.
 */
export type FormulaScope = 'active' | 'all';

export type ListFormulasInput = {
  centerCode: CenterCode;
  scope: FormulaScope;
};

/**
 * Lists a center's formulas for the SOU-62 CRUD table and subscription pickers.
 * Gated by `core.formulas` (every plan; the guard still has one home). `scope`
 * selects the active picker set or every live formula. Ordering is alphabetical
 * by French name — a stable, locale-agnostic default the use case owns, so it
 * does not depend on adapter row order (the in-memory fake and SQLite agree).
 * Mirrors `ListSubjects`.
 */
export class ListFormulas {
  constructor(
    private readonly formulas: FormulaRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ListFormulasInput): Promise<readonly Formula[]> {
    this.plan.require('core.formulas');
    const formulas =
      input.scope === 'active'
        ? await this.formulas.listActive(input.centerCode)
        : await this.formulas.listAll(input.centerCode);
    return [...formulas].sort((a, b) => a.name.fr.localeCompare(b.name.fr));
  }
}
