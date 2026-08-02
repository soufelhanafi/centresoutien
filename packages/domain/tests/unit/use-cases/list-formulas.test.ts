import { describe, it, expect, beforeEach } from 'vitest';
import { ListFormulas } from '../../../src/use-cases/list-formulas';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Formula, FormulaId } from '../../../src/entities/formula';
import type { SubjectId } from '../../../src/entities/subject';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryFormulaRepository } from '../fakes/in-memory-formula-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const MATH = 'sub_00000000000000000000000003' as SubjectId;

describe('ListFormulas', () => {
  let formulas: InMemoryFormulaRepository;
  let useCase: ListFormulas;
  let ids: ReturnType<typeof fakeIds>;

  function makeFormula(
    name: { fr: string; ar: string },
    opts: { center?: CenterCode; active?: boolean } = {},
  ): Formula {
    return {
      id: ids.next('fml') as FormulaId,
      ...newEnvelope(
        { centerCode: opts.center ?? CENTER, deviceOrigin: DEVICE, updatedBy: USER },
        fakeClock(),
      ),
      name,
      subjectIds: [MATH],
      priceMad: 20000,
      kind: 'regular',
      isImmutable: false,
      active: opts.active ?? true,
    };
  }

  async function seed(
    name: { fr: string; ar: string },
    opts: { center?: CenterCode; active?: boolean } = {},
  ): Promise<Formula> {
    const formula = makeFormula(name, opts);
    await formulas.save(formula);
    return formula;
  }

  beforeEach(() => {
    formulas = new InMemoryFormulaRepository();
    ids = fakeIds();
    const plan = new PlanPolicy(PLANS.essentiel);
    useCase = new ListFormulas(formulas, plan);
  });

  it('returns only active formulas, alphabetized by French name', async () => {
    await seed({ fr: 'Math + Physique', ar: 'رياضيات وفيزياء' });
    await seed({ fr: 'Anglais seul', ar: 'الإنجليزية فقط' });
    await seed({ fr: 'Chimie seule', ar: 'الكيمياء فقط' }, { active: false });

    const result = await useCase.execute({ centerCode: CENTER });

    expect(result.map((f) => f.name.fr)).toEqual(['Anglais seul', 'Math + Physique']);
  });

  it('excludes tombstoned formulas', async () => {
    const doomed = await seed({ fr: 'Math seul', ar: 'الرياضيات فقط' });
    await formulas.softDelete(doomed.id, new Date('2026-07-30T09:00:00Z'), USER);

    expect(await useCase.execute({ centerCode: CENTER })).toHaveLength(0);
  });

  it('is center-scoped: never returns another center formulas', async () => {
    await seed({ fr: 'Math seul', ar: 'الرياضيات فقط' });
    await seed({ fr: 'Physique seule', ar: 'الفيزياء فقط' }, { center: OTHER_CENTER });

    const result = await useCase.execute({ centerCode: CENTER });
    expect(result.map((f) => f.name.fr)).toEqual(['Math seul']);
  });

  it('throws PlanFeatureUnavailableError when the plan lacks core.formulas', async () => {
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(),
      limits: PLANS.essentiel.limits,
    };
    useCase = new ListFormulas(formulas, new PlanPolicy(planWithout));

    await expect(useCase.execute({ centerCode: CENTER })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
