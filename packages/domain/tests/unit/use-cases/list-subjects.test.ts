import { describe, it, expect, beforeEach } from 'vitest';
import { ListSubjects } from '../../../src/use-cases/list-subjects';
import { CreateSubject } from '../../../src/use-cases/create-subject';
import { UpdateSubject } from '../../../src/use-cases/update-subject';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { Subject } from '../../../src/entities/subject';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemorySubjectRepository } from '../fakes/in-memory-subject-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

describe('ListSubjects', () => {
  let subjects: InMemorySubjectRepository;
  let useCase: ListSubjects;
  let create: CreateSubject;
  let update: UpdateSubject;

  async function seed(
    name: { fr: string; ar: string },
    opts: { center?: CenterCode; active?: boolean } = {},
  ): Promise<Subject> {
    const subject = await create.execute({
      name,
      centerCode: opts.center ?? CENTER,
      deviceOrigin: DEVICE,
      updatedBy: USER,
    });
    if (opts.active === false) {
      return update.execute({
        id: subject.id,
        centerCode: opts.center ?? CENTER,
        updatedBy: USER,
        name,
        active: false,
      });
    }
    return subject;
  }

  beforeEach(() => {
    subjects = new InMemorySubjectRepository();
    const plan = new PlanPolicy(PLANS.essentiel);
    create = new CreateSubject(subjects, fakeClock(), fakeIds(), plan);
    update = new UpdateSubject(subjects, fakeClock(), plan);
    useCase = new ListSubjects(subjects, plan);
  });

  it('active scope returns only active subjects, alphabetized by French name', async () => {
    await seed({ fr: 'Physique', ar: 'فيزياء' });
    await seed({ fr: 'Arabe', ar: 'العربية' });
    await seed({ fr: 'Chimie', ar: 'كيمياء' }, { active: false });

    const result = await useCase.execute({ centerCode: CENTER, scope: 'active' });

    expect(result.map((s) => s.name.fr)).toEqual(['Arabe', 'Physique']);
  });

  it('all scope includes deactivated subjects', async () => {
    await seed({ fr: 'Physique', ar: 'فيزياء' });
    await seed({ fr: 'Chimie', ar: 'كيمياء' }, { active: false });

    const result = await useCase.execute({ centerCode: CENTER, scope: 'all' });

    expect(result.map((s) => s.name.fr)).toEqual(['Chimie', 'Physique']);
  });

  it('excludes tombstoned subjects from both scopes', async () => {
    const doomed = await seed({ fr: 'Physique', ar: 'فيزياء' });
    await subjects.softDelete(doomed.id, new Date('2026-07-30T09:00:00Z'), USER);

    expect(await useCase.execute({ centerCode: CENTER, scope: 'active' })).toHaveLength(0);
    expect(await useCase.execute({ centerCode: CENTER, scope: 'all' })).toHaveLength(0);
  });

  it('is center-scoped: never returns another center subjects', async () => {
    await seed({ fr: 'Physique', ar: 'فيزياء' });
    await seed({ fr: 'Géographie', ar: 'جغرافيا' }, { center: OTHER_CENTER });

    const result = await useCase.execute({ centerCode: CENTER, scope: 'all' });
    expect(result.map((s) => s.name.fr)).toEqual(['Physique']);
  });

  it('throws PlanFeatureUnavailableError when the plan lacks core.subjects', async () => {
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(),
      limits: PLANS.essentiel.limits,
    };
    useCase = new ListSubjects(subjects, new PlanPolicy(planWithout));

    await expect(useCase.execute({ centerCode: CENTER, scope: 'active' })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
