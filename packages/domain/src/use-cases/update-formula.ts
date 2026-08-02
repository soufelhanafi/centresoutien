import type { FormulaRepository } from '../ports/formula-repository';
import type { SubjectRepository } from '../ports/subject-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import { updateFormula as applyFormulaWrite } from '../policies/formula-policy';
import { validateFormulaSubjects } from '../policies/validate-formula-subjects';
import { formulaInputSchema, type FormulaInput } from '../schemas/formula';
import { FormulaNotFoundError } from '../errors/formula-errors';
import type { Formula, FormulaId } from '../entities/formula';
import type { SubjectId } from '../entities/subject';
import type { CenterCode, UserId } from '../value-objects/ids';

export type UpdateFormulaInput = FormulaInput & {
  centerCode: CenterCode;
  id: FormulaId;
  updatedBy: UserId;
};

/**
 * Edits a Formula's user-facing fields (name, subjects, price, kind). Gated by
 * `core.formulas`; switching to `kind: 'exam-prep'` additionally requires
 * `core.exam-prep` (Pro+), exactly like `CreateFormula`.
 *
 * Validates with the shared `formulaInputSchema`, then re-runs the same
 * cross-entity subject check `CreateFormula` does (`validateFormulaSubjects`) —
 * it is an invariant of a Formula at rest, not just at creation. The actual write
 * goes through the `updateFormula` policy (aliased here to avoid a name clash with
 * this class), which enforces the immutable-once-referenced barrier
 * (`FormulaImmutableError`) — a formula that has been billed rejects **every**
 * patch, including a no-op. The correct move for a used formula is
 * `CloneFormula` + `DeactivateFormula`, not this use case.
 *
 * `active` is deliberately not part of `formulaInputSchema` and is never touched
 * here — see `DeactivateFormula` for the only path that writes it. Identity and
 * provenance are preserved: `id`, `centerCode`, `deviceOrigin`, `createdAt`, and
 * `version` are never touched. Unknown, soft-deleted, or foreign-center ids raise
 * {@link FormulaNotFoundError} rather than inserting a new row. Mirrors
 * {@link UpdateGroup}.
 */
export class UpdateFormula {
  constructor(
    private readonly formulas: FormulaRepository,
    private readonly subjects: SubjectRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: UpdateFormulaInput): Promise<Formula> {
    this.plan.require('core.formulas');
    const fields = formulaInputSchema.parse(input);
    if (fields.kind === 'exam-prep') {
      this.plan.require('core.exam-prep');
    }

    const existing = await this.formulas.findById(input.id);
    // Center-scoped: a row from another tenant is not editable here. Redundant on
    // desktop (one DB per center), load-bearing on the future shared backend.
    if (existing === null || existing.centerCode !== input.centerCode) {
      throw new FormulaNotFoundError(input.id);
    }

    const subjectIds = fields.subjectIds as SubjectId[];
    await validateFormulaSubjects(subjectIds, input.centerCode, this.subjects);

    const { next, changedFields } = applyFormulaWrite(
      existing,
      { name: fields.name, subjectIds, priceMad: fields.priceMad, kind: fields.kind },
      { clock: this.clock, updatedBy: input.updatedBy },
    );
    if (changedFields.length > 0) {
      await this.formulas.save(next);
    }
    return next;
  }
}
