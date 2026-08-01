import { describe, it, expect, beforeEach } from 'vitest';
import { GetSubject } from '../../../src/use-cases/get-subject';
import { CreateSubject } from '../../../src/use-cases/create-subject';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { Subject, SubjectId } from '../../../src/entities/subject';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemorySubjectRepository } from '../fakes/in-memory-subject-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

describe('GetSubject', () => {
  let subjects: InMemorySubjectRepository;
  let useCase: GetSubject;
  let create: CreateSubject;

  async function seed(): Promise<Subject> {
    return create.execute({
      name: { fr: 'Mathématiques', ar: 'الرياضيات' },
      centerCode: CENTER,
      deviceOrigin: DEVICE,
      updatedBy: USER,
    });
  }

  beforeEach(() => {
    subjects = new InMemorySubjectRepository();
    const plan = new PlanPolicy(PLANS.essentiel);
    create = new CreateSubject(subjects, fakeClock(), fakeIds(), plan);
    useCase = new GetSubject(subjects, plan);
  });

  it('returns the subject for a known live id', async () => {
    const original = await seed();
    expect(await useCase.execute({ centerCode: CENTER, id: original.id })).toEqual(original);
  });

  it('returns null for an unknown id', async () => {
    expect(
      await useCase.execute({ centerCode: CENTER, id: 'sub_00000000000000000000000404' as SubjectId }),
    ).toBeNull();
  });

  it('returns null for a soft-deleted id', async () => {
    const original = await seed();
    await subjects.softDelete(original.id, new Date('2026-07-30T09:00:00Z'), USER);
    expect(await useCase.execute({ centerCode: CENTER, id: original.id })).toBeNull();
  });

  it('returns null for a foreign-center id (tenant scope)', async () => {
    const original = await seed();
    expect(
      await useCase.execute({ centerCode: 'CS-RABAT-002' as CenterCode, id: original.id }),
    ).toBeNull();
  });

  it('throws PlanFeatureUnavailableError when the plan lacks core.subjects', async () => {
    const original = await seed();
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(),
      limits: PLANS.essentiel.limits,
    };
    useCase = new GetSubject(subjects, new PlanPolicy(planWithout));

    await expect(useCase.execute({ centerCode: CENTER, id: original.id })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
