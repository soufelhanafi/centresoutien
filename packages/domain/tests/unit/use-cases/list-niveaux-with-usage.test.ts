import { describe, it, expect, beforeEach } from 'vitest';
import { ListNiveauxWithUsage } from '../../../src/use-cases/list-niveaux-with-usage';
import { CreateNiveau } from '../../../src/use-cases/create-niveau';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { Niveau } from '../../../src/entities/niveau';
import type { CenterCode, DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';
import { InMemoryNiveauRepository } from '../fakes/in-memory-niveau-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

describe('ListNiveauxWithUsage', () => {
  let niveaux: InMemoryNiveauRepository;
  let useCase: ListNiveauxWithUsage;
  let create: CreateNiveau;

  async function seed(name: { fr: string; ar: string }, category: Niveau['category']): Promise<Niveau> {
    return create.execute({ name, category, centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER });
  }

  beforeEach(() => {
    niveaux = new InMemoryNiveauRepository();
    const plan = new PlanPolicy(PLANS.essentiel);
    create = new CreateNiveau(niveaux, fakeClock(), fakeIds(), plan);
    useCase = new ListNiveauxWithUsage(niveaux, plan);
  });

  it('pairs each niveau with its in-use count and derived canDelete', async () => {
    const referenced = await seed({ fr: '2ème Bac SVT', ar: 'الثانية باكالوريا' }, 'lycee');
    const free = await seed({ fr: '1AP', ar: 'الأولى ابتدائي' }, 'primaire');
    niveaux.setUsageCount(referenced.id, 3);

    const rows = await useCase.execute({ centerCode: CENTER });

    const svt = rows.find((r) => r.niveau.id === referenced.id);
    const ap = rows.find((r) => r.niveau.id === free.id);
    expect(svt).toMatchObject({ inUseCount: 3, canDelete: false });
    expect(ap).toMatchObject({ inUseCount: 0, canDelete: true });
  });

  it('passes the repository’s named reference breakdown through unchanged', async () => {
    const referenced = await seed({ fr: '2ème Bac SVT', ar: 'الثانية باكالوريا' }, 'lycee');
    const studentRef = {
      kind: 'student' as const,
      id: 'stu_00000000000000000000000001' as EntityId,
      label: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    };
    niveaux.setReferences(referenced.id, [studentRef]);

    const rows = await useCase.execute({ centerCode: CENTER });

    const svt = rows.find((r) => r.niveau.id === referenced.id);
    expect(svt).toMatchObject({ inUseCount: 1, references: [studentRef] });
  });

  it('defaults references to an empty array when the repository sets none', async () => {
    const free = await seed({ fr: '1AP', ar: 'الأولى ابتدائي' }, 'primaire');

    const rows = await useCase.execute({ centerCode: CENTER });

    expect(rows.find((r) => r.niveau.id === free.id)?.references).toEqual([]);
  });

  it('throws PlanFeatureUnavailableError when the plan lacks core.niveaux', async () => {
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(),
      limits: PLANS.essentiel.limits,
    };
    useCase = new ListNiveauxWithUsage(niveaux, new PlanPolicy(planWithout));

    await expect(useCase.execute({ centerCode: CENTER })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
