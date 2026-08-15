import { describe, it, expect, beforeEach } from 'vitest';
import { ListNiveaux } from '../../../src/use-cases/list-niveaux';
import { CreateNiveau } from '../../../src/use-cases/create-niveau';
import { UpdateNiveau } from '../../../src/use-cases/update-niveau';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { Niveau } from '../../../src/entities/niveau';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryNiveauRepository } from '../fakes/in-memory-niveau-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

describe('ListNiveaux', () => {
  let niveaux: InMemoryNiveauRepository;
  let useCase: ListNiveaux;
  let create: CreateNiveau;
  let update: UpdateNiveau;

  async function seed(
    name: { fr: string; ar: string },
    category: Niveau['category'],
    opts: { center?: CenterCode; active?: boolean } = {},
  ): Promise<Niveau> {
    const niveau = await create.execute({
      name,
      category,
      centerCode: opts.center ?? CENTER,
      deviceOrigin: DEVICE,
      updatedBy: USER,
    });
    if (opts.active === false) {
      return update.execute({
        id: niveau.id,
        centerCode: opts.center ?? CENTER,
        updatedBy: USER,
        name,
        category,
        active: false,
      });
    }
    return niveau;
  }

  beforeEach(() => {
    niveaux = new InMemoryNiveauRepository();
    const plan = new PlanPolicy(PLANS.essentiel);
    create = new CreateNiveau(niveaux, fakeClock(), fakeIds(), plan);
    update = new UpdateNiveau(niveaux, fakeClock(), plan);
    useCase = new ListNiveaux(niveaux, plan);
  });

  it('active scope returns only active niveaux, category-ordered then by French name', async () => {
    await seed({ fr: '2ème Bac SVT', ar: 'الثانية باكالوريا' }, 'lycee');
    await seed({ fr: '1AP', ar: 'الأولى ابتدائي' }, 'primaire');
    await seed({ fr: '1AC', ar: 'الأولى إعدادي' }, 'college');
    await seed({ fr: '1ère Bac Lettres', ar: 'الأولى باكالوريا آداب' }, 'lycee', { active: false });

    const result = await useCase.execute({ centerCode: CENTER, scope: 'active' });

    // primaire → college → lycee; within lycee, alphabetical by FR name.
    // (1ère Bac Lettres is deactivated, so it falls out of the active scope.)
    expect(result.map((n) => n.category)).toEqual(['primaire', 'college', 'lycee']);
    expect(result.map((n) => n.name.fr)).toEqual(['1AP', '1AC', '2ème Bac SVT']);
  });

  it('all scope includes deactivated niveaux in the same order', async () => {
    await seed({ fr: '2ème Bac SVT', ar: 'الثانية باكالوريا' }, 'lycee');
    await seed({ fr: '1AP', ar: 'الأولى ابتدائي' }, 'primaire', { active: false });

    const result = await useCase.execute({ centerCode: CENTER, scope: 'all' });

    expect(result.map((n) => n.name.fr)).toEqual(['1AP', '2ème Bac SVT']);
  });

  it('excludes tombstoned niveaux from both scopes', async () => {
    const doomed = await seed({ fr: '1AP', ar: 'الأولى ابتدائي' }, 'primaire');
    await niveaux.softDelete(doomed.id, new Date('2026-07-30T09:00:00Z'), USER);

    expect(await useCase.execute({ centerCode: CENTER, scope: 'active' })).toHaveLength(0);
    expect(await useCase.execute({ centerCode: CENTER, scope: 'all' })).toHaveLength(0);
  });

  it('is center-scoped: never returns another center niveaux', async () => {
    await seed({ fr: '1AP', ar: 'الأولى ابتدائي' }, 'primaire');
    await seed({ fr: '1AC', ar: 'الأولى إعدادي' }, 'college', { center: OTHER_CENTER });

    const result = await useCase.execute({ centerCode: CENTER, scope: 'all' });
    expect(result.map((n) => n.name.fr)).toEqual(['1AP']);
  });

  it('throws PlanFeatureUnavailableError when the plan lacks core.niveaux', async () => {
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(),
      limits: PLANS.essentiel.limits,
    };
    useCase = new ListNiveaux(niveaux, new PlanPolicy(planWithout));

    await expect(useCase.execute({ centerCode: CENTER, scope: 'active' })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
