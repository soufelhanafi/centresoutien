import type { FormulaRepository } from '../ports/formula-repository';
import type { SubjectRepository } from '../ports/subject-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
import { validateFormulaSubjects } from '../policies/validate-formula-subjects';
import { assertValidFormulaSubjectPrices } from '../policies/formula-subject-prices';
import { FORMULA_ID_PREFIX, type Formula, type FormulaId } from '../entities/formula';
import { FormulaNotFoundError } from '../errors/formula-errors';

export type CloneFormulaInput = {
  centerCode: CenterCode;
  sourceId: FormulaId;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/**
 * Clones a Formula into a fresh, editable copy — the SOU-62 "dupliquer" action:
 * CLAUDE.md §7's prescribed move for a price/subject/kind change on a formula
 * that has already been billed (`isImmutable: true`) is to create a *new*
 * Formula and deactivate the old one (see `DeactivateFormula`), never to mutate
 * one that has been used. Cloning an already-mutable formula is equally allowed
 * — nothing about this action depends on the source's `isImmutable` state.
 *
 * Gated by `core.formulas`; an exam-prep source additionally requires
 * `core.exam-prep` (Pro+), exactly like `CreateFormula` — cloning must not let an
 * Essentiel center end up owning an exam-prep formula. Copies `name`,
 * `subjectIds`, `priceMad`, and `kind` verbatim into a brand-new entity: fresh
 * id, fresh envelope, `active: true`, `isImmutable: false`. Re-runs
 * `validateFormulaSubjects` on the copied bundle — a subject that was deactivated
 * since the source formula was created must not seed a new formula either.
 *
 * The source is **center-scoped**: an unknown, soft-deleted, or foreign-center
 * `sourceId` raises {@link FormulaNotFoundError}. Does not touch the source
 * formula in any way — deactivating it, if desired, is a separate explicit
 * `DeactivateFormula` call.
 */
export class CloneFormula {
  constructor(
    private readonly formulas: FormulaRepository,
    private readonly subjects: SubjectRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CloneFormulaInput): Promise<Formula> {
    this.plan.require('core.formulas');

    const source = await this.formulas.findById(input.sourceId);
    if (source === null || source.centerCode !== input.centerCode) {
      throw new FormulaNotFoundError(input.sourceId);
    }
    if (source.kind === 'exam-prep') {
      this.plan.require('core.exam-prep');
    }

    await validateFormulaSubjects(source.subjectIds, input.centerCode, this.subjects);
    assertValidFormulaSubjectPrices(source.subjectIds, source.priceMad, source.subjectPrices);

    const clone: Formula = {
      id: this.ids.next(FORMULA_ID_PREFIX) as FormulaId,
      ...newEnvelope(
        {
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        this.clock,
      ),
      name: { ...source.name },
      subjectIds: [...source.subjectIds],
      priceMad: source.priceMad,
      ...(source.subjectPrices !== undefined && { subjectPrices: source.subjectPrices.map((entry) => ({ ...entry })) }),
      kind: source.kind,
      isImmutable: false,
      active: true,
    };

    await this.formulas.save(clone);
    return clone;
  }
}
