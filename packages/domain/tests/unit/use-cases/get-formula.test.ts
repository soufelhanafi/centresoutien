import { describe, it, expect, beforeEach } from 'vitest';
import { GetFormula } from '../../../src/use-cases/get-formula';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { Formula, FormulaId } from '../../../src/entities/formula';
import type { SubjectId } from '../../../src/entities/subject';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryFormulaRepository } from '../fakes/in-memory-formula-repository';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const MATH = 'sub_00000000000000000000000003' as SubjectId;

function makeFormula(overrides: Partial<Formula> = {}): Formula {
  return {
    id: 'fml_00000000000000000000000001' as FormulaId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    name: { fr: 'Math seul', ar: 'رياضيات فقط' },
    subjectIds: [MATH],
    priceMad: 20000,
    kind: 'regular',
    isImmutable: false,
    active: true,
    ...overrides,
  };
}

describe('GetFormula', () => {
  let formulas: InMemoryFormulaRepository;
  let useCase: GetFormula;

  beforeEach(() => {
    formulas = new InMemoryFormulaRepository();
    useCase = new GetFormula(formulas, new PlanPolicy(PLANS.essentiel));
  });

  it('returns the formula for a live, same-center id', async () => {
    const formula = makeFormula();
    await formulas.save(formula);
    expect(await useCase.execute({ centerCode: CENTER, id: formula.id })).toEqual(formula);
  });

  it('returns null for an unknown id', async () => {
    expect(
      await useCase.execute({ centerCode: CENTER, id: 'fml_00000000000000000000000099' as FormulaId }),
    ).toBeNull();
  });

  it('returns null for a soft-deleted id', async () => {
    const formula = makeFormula();
    await formulas.save(formula);
    await formulas.softDelete(formula.id, new Date('2026-08-02T00:00:00Z'), USER);
    expect(await useCase.execute({ centerCode: CENTER, id: formula.id })).toBeNull();
  });

  it('returns null for a foreign-center id (tenant scope)', async () => {
    const formula = makeFormula();
    await formulas.save(formula);
    expect(await useCase.execute({ centerCode: 'CS-RABAT-002' as CenterCode, id: formula.id })).toBeNull();
  });

  it('throws PlanFeatureUnavailableError when the plan lacks core.formulas', async () => {
    const planWithout: Plan = { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };
    useCase = new GetFormula(formulas, new PlanPolicy(planWithout));
    await expect(
      useCase.execute({ centerCode: CENTER, id: 'fml_00000000000000000000000001' as FormulaId }),
    ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
  });
});
