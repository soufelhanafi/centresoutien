import type { FormulaRepository } from '../ports/formula-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import { deactivateFormula as applyDeactivate } from '../policies/formula-policy';
import { FormulaNotFoundError } from '../errors/formula-errors';
import type { Formula, FormulaId } from '../entities/formula';
import type { CenterCode, UserId } from '../value-objects/ids';

export type DeactivateFormulaInput = {
  centerCode: CenterCode;
  id: FormulaId;
  updatedBy: UserId;
};

/**
 * Sets a Formula's `active` flag to `false` — the one path allowed to write it
 * even when the formula is `isImmutable: true` (see `deactivateFormula` in
 * `policies/formula-policy.ts` for why: `UpdateFormula` rejects every patch on a
 * used formula, so CLAUDE.md §7's "deactivate the old one" step needs its own
 * operation). Gated by `core.formulas`. The SOU-62 CRUD UI wires its single
 * "deactivate" action here for every formula, mutable or immutable alike, rather
 * than branching between two code paths.
 *
 * One-directional by design — there is no `ActivateFormula`; `active` is absent
 * from `formulaInputSchema` entirely. Idempotent: deactivating an already-inactive
 * formula is a no-op write (via `applyWrite`'s changed-fields check), not an
 * error. Unknown, soft-deleted, or foreign-center ids raise
 * {@link FormulaNotFoundError}. Mirrors the shape of `ArchiveSubject` /
 * `UpdateSubject` without their in-use / immutability tradeoffs.
 */
export class DeactivateFormula {
  constructor(
    private readonly formulas: FormulaRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: DeactivateFormulaInput): Promise<Formula> {
    this.plan.require('core.formulas');

    const existing = await this.formulas.findById(input.id);
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new FormulaNotFoundError(input.id);
    }

    const { next, changedFields } = applyDeactivate(existing, {
      clock: this.clock,
      updatedBy: input.updatedBy,
    });
    if (changedFields.length > 0) {
      await this.formulas.save(next);
    }
    return next;
  }
}
