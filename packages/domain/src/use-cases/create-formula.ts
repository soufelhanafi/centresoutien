import type { FormulaRepository } from '../ports/formula-repository';
import type { SubjectRepository } from '../ports/subject-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import { newEnvelope } from '../entities/envelope';
import { validateFormulaSubjects } from '../policies/validate-formula-subjects';
import { assertValidFormulaSubjectPrices } from '../policies/formula-subject-prices';
import { formulaInputSchema, type FormulaInput } from '../schemas/formula';
import { FORMULA_ID_PREFIX, type Formula, type FormulaId, type FormulaSubjectPrice } from '../entities/formula';
import type { SubjectId } from '../entities/subject';

export type CreateFormulaInput = FormulaInput & {
  centerCode: CenterCode;
  deviceOrigin: DeviceId;
  updatedBy: UserId;
};

/**
 * Creates a Formula for a center. Gated by `core.formulas` (every plan); an
 * exam-prep formula additionally requires `core.exam-prep` (Pro+), exactly like
 * `CreateGroup` — an Essentiel center can only ever create `kind: 'regular'`
 * formulas.
 *
 * Validates the user fields with the shared `formulaInputSchema` (the domain is
 * the authority even though the form validates first), then runs the
 * cross-entity check a pure schema cannot: every id in `subjectIds` resolves to a
 * live, active, same-center Subject (`validateFormulaSubjects`,
 * `FormulaSubjectUnavailableError`). A new formula starts `active: true` and
 * `isImmutable: false` — the SQLite trigger (SOU-61), never the domain, ever
 * flips the latter.
 */
export class CreateFormula {
  constructor(
    private readonly formulas: FormulaRepository,
    private readonly subjects: SubjectRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CreateFormulaInput): Promise<Formula> {
    this.plan.require('core.formulas');
    const fields = formulaInputSchema.parse(input);
    if (fields.kind === 'exam-prep') {
      this.plan.require('core.exam-prep');
    }

    const subjectIds = fields.subjectIds as SubjectId[];
    const subjectPrices = fields.subjectPrices as readonly FormulaSubjectPrice[] | undefined;
    await validateFormulaSubjects(subjectIds, input.centerCode, this.subjects);
    assertValidFormulaSubjectPrices(subjectIds, fields.priceMad, subjectPrices);

    const formula: Formula = {
      id: this.ids.next(FORMULA_ID_PREFIX) as FormulaId,
      ...newEnvelope(
        {
          centerCode: input.centerCode,
          deviceOrigin: input.deviceOrigin,
          updatedBy: input.updatedBy,
        },
        this.clock,
      ),
      name: fields.name,
      subjectIds,
      priceMad: fields.priceMad,
      ...(subjectPrices !== undefined && { subjectPrices }),
      kind: fields.kind,
      isImmutable: false,
      active: true,
    };

    await this.formulas.save(formula);
    return formula;
  }
}
