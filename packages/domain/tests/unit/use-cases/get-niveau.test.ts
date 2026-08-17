import { describe, it, expect, beforeEach } from 'vitest';
import { GetNiveau } from '../../../src/use-cases/get-niveau';
import { CreateNiveau } from '../../../src/use-cases/create-niveau';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { Niveau, NiveauId } from '../../../src/entities/niveau';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryNiveauRepository } from '../fakes/in-memory-niveau-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

describe('GetNiveau', () => {
  let niveaux: InMemoryNiveauRepository;
  let useCase: GetNiveau;
  let seeded: Niveau;

  beforeEach(async () => {
    niveaux = new InMemoryNiveauRepository();
    const create = new CreateNiveau(
      niveaux,
      fakeClock(),
      fakeIds(),
      new PlanPolicy(PLANS.essentiel),
    );
    seeded = await create.execute({
      name: { fr: '2ème Bac SVT', ar: 'الثانية باكالوريا' },
      category: 'lycee',
      centerCode: CENTER,
      deviceOrigin: DEVICE,
      updatedBy: USER,
    });
    useCase = new GetNiveau(niveaux, new PlanPolicy(PLANS.essentiel));
  });

  it('returns the live niveau by id', async () => {
    const found = await useCase.execute({ centerCode: CENTER, id: seeded.id });
    expect(found).toEqual(seeded);
  });

  it('returns null for an unknown id', async () => {
    const found = await useCase.execute({
      centerCode: CENTER,
      id: 'niv_00000000000000000000000404' as NiveauId,
    });
    expect(found).toBeNull();
  });

  it('returns null for a soft-deleted id', async () => {
    await niveaux.softDelete(seeded.id, new Date('2026-07-30T09:00:00Z'), USER);
    const found = await useCase.execute({ centerCode: CENTER, id: seeded.id });
    expect(found).toBeNull();
  });

  it('treats a foreign-center niveau as not found (tenant scope)', async () => {
    const found = await useCase.execute({ centerCode: 'CS-RABAT-002' as CenterCode, id: seeded.id });
    expect(found).toBeNull();
  });

  it('throws PlanFeatureUnavailableError when the plan lacks core.niveaux', async () => {
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(),
      limits: PLANS.essentiel.limits,
    };
    useCase = new GetNiveau(niveaux, new PlanPolicy(planWithout));
    await expect(useCase.execute({ centerCode: CENTER, id: seeded.id })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
