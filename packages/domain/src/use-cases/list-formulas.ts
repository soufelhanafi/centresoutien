import type { FormulaRepository } from '../ports/formula-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { Formula } from '../entities/formula';

export type ListFormulasInput = {
  centerCode: CenterCode;
};

/**
 * Lists a center's active formulas for the new-subscription formula picker
 * (SOU-65). Gated by `core.formulas` (every plan). Unlike `ListSubjects`, there
 * is no `scope` — `FormulaRepository` only exposes the active picker set, since
 * an inactive formula must never be offered for a new subscription (CLAUDE.md
 * §7: deactivated formulas stay queryable for historical reports, not for new
 * subscriptions). Ordering is alphabetical by French name, mirroring
 * `ListSubjects` so the picker and the subject list behave identically.
 */
export class ListFormulas {
  constructor(
    private readonly formulas: FormulaRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: ListFormulasInput): Promise<readonly Formula[]> {
    this.plan.require('core.formulas');
    const formulas = await this.formulas.listActive(input.centerCode);
    return [...formulas].sort((a, b) => a.name.fr.localeCompare(b.name.fr));
  }
}
