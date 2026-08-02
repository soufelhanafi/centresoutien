import type { FormulaRepository } from '../ports/formula-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { Formula, FormulaId } from '../entities/formula';

export type GetFormulaInput = { centerCode: CenterCode; id: FormulaId };

/**
 * Loads a single formula by id for the SOU-62 edit dialog and clone flow. Gated
 * by `core.formulas`. Returns `null` for an unknown or soft-deleted id — the
 * repository read already hides tombstones, so "archived" and "never existed"
 * collapse to the same not-found the caller renders.
 *
 * The result is **center-scoped**: a row whose `centerCode` differs from the
 * caller's is treated as not-found. On desktop the one-DB-per-center boundary
 * makes this redundant, but the domain is the portable core — the same use case
 * runs on the future shared-Postgres backend where an id alone is not a tenant
 * guard. Mirrors `GetSubject`.
 */
export class GetFormula {
  constructor(
    private readonly formulas: FormulaRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetFormulaInput): Promise<Formula | null> {
    this.plan.require('core.formulas');
    const formula = await this.formulas.findById(input.id);
    return formula && formula.centerCode === input.centerCode ? formula : null;
  }
}
