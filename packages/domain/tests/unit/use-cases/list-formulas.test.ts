import { describe, it, expect, beforeEach } from 'vitest';
import { ListFormulas } from '../../../src/use-cases/list-formulas';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { Formula, FormulaId } from '../../../src/entities/formula';
import type { SubjectId } from '../../../src/entities/subject';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryFormulaRepository } from '../fakes/in-memory-formula-repository';

const CENTER = 'CS-CASA-001' as CenterCode;
const RABAT = 'CS-RABAT-002' as CenterCode;
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

describe('ListFormulas', () => {
  let formulas: InMemoryFormulaRepository;
  let useCase: ListFormulas;

  beforeEach(async () => {
    formulas = new InMemoryFormulaRepository();
    useCase = new ListFormulas(formulas, new PlanPolicy(PLANS.essentiel));

    await formulas.save(makeFormula({ id: 'fml_00000000000000000000000001' as FormulaId, name: { fr: 'Physique', ar: 'فيزياء' }, active: true }));
    await formulas.save(makeFormula({ id: 'fml_00000000000000000000000002' as FormulaId, name: { fr: 'Arabe', ar: 'العربية' }, active: true }));
    await formulas.save(makeFormula({ id: 'fml_00000000000000000000000003' as FormulaId, name: { fr: 'Chimie', ar: 'كيمياء' }, active: false }));
    const gone = makeFormula({ id: 'fml_00000000000000000000000004' as FormulaId, name: { fr: 'Anglais', ar: 'إنجليزية' } });
    await formulas.save(gone);
    await formulas.softDelete(gone.id, new Date('2026-08-02T00:00:00Z'), USER);
    await formulas.save(makeFormula({ id: 'fml_00000000000000000000000005' as FormulaId, centerCode: RABAT, name: { fr: 'Géographie', ar: 'جغرافيا' } }));
  });

  it('scope active: returns only live, active formulas of the center, name-ordered', async () => {
    const result = await useCase.execute({ centerCode: CENTER, scope: 'active' });
    expect(result.map((f) => f.name.fr)).toEqual(['Arabe', 'Physique']);
  });

  it('scope all: returns every live formula of the center (active + inactive), tombstones/other centers excluded', async () => {
    const result = await useCase.execute({ centerCode: CENTER, scope: 'all' });
    expect(result.map((f) => f.name.fr)).toEqual(['Arabe', 'Chimie', 'Physique']);
  });

  it('is center-scoped', async () => {
    const result = await useCase.execute({ centerCode: RABAT, scope: 'all' });
    expect(result.map((f) => f.name.fr)).toEqual(['Géographie']);
  });

  it('throws PlanFeatureUnavailableError when the plan lacks core.formulas', async () => {
    const planWithout: Plan = { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };
    useCase = new ListFormulas(formulas, new PlanPolicy(planWithout));
    await expect(useCase.execute({ centerCode: CENTER, scope: 'active' })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
