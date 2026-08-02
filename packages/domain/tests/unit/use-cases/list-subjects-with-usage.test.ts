import { describe, it, expect, beforeEach } from 'vitest';
import { ListSubjectsWithUsage } from '../../../src/use-cases/list-subjects-with-usage';
import { CreateSubject } from '../../../src/use-cases/create-subject';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { Subject } from '../../../src/entities/subject';
import type { CenterCode, DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';
import { InMemorySubjectRepository } from '../fakes/in-memory-subject-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

describe('ListSubjectsWithUsage', () => {
  let subjects: InMemorySubjectRepository;
  let useCase: ListSubjectsWithUsage;
  let create: CreateSubject;

  async function seed(name: { fr: string; ar: string }): Promise<Subject> {
    return create.execute({ name, centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER });
  }

  beforeEach(() => {
    subjects = new InMemorySubjectRepository();
    const plan = new PlanPolicy(PLANS.essentiel);
    create = new CreateSubject(subjects, fakeClock(), fakeIds(), plan);
    useCase = new ListSubjectsWithUsage(subjects, plan);
  });

  it('pairs each subject with its in-use count and derived canDelete', async () => {
    const referenced = await seed({ fr: 'Mathématiques', ar: 'الرياضيات' });
    const free = await seed({ fr: 'Physique', ar: 'فيزياء' });
    subjects.setUsageCount(referenced.id, 3);

    const rows = await useCase.execute({ centerCode: CENTER });

    const math = rows.find((r) => r.subject.id === referenced.id);
    const phys = rows.find((r) => r.subject.id === free.id);
    expect(math).toMatchObject({ inUseCount: 3, canDelete: false });
    expect(phys).toMatchObject({ inUseCount: 0, canDelete: true });
  });

  it('passes the repository’s named reference breakdown through unchanged', async () => {
    const referenced = await seed({ fr: 'Mathématiques', ar: 'الرياضيات' });
    const groupRef = {
      kind: 'group' as const,
      id: 'grp_00000000000000000000000001' as EntityId,
      label: { fr: '3ème Bac', ar: '3ème Bac' },
    };
    subjects.setUsageCount(referenced.id, 1);
    subjects.setReferences(referenced.id, [groupRef]);

    const rows = await useCase.execute({ centerCode: CENTER });

    const math = rows.find((r) => r.subject.id === referenced.id);
    expect(math?.references).toEqual([groupRef]);
  });

  it('defaults references to an empty array when the repository sets none', async () => {
    const free = await seed({ fr: 'Physique', ar: 'فيزياء' });

    const rows = await useCase.execute({ centerCode: CENTER });

    expect(rows.find((r) => r.subject.id === free.id)?.references).toEqual([]);
  });

  it('throws PlanFeatureUnavailableError when the plan lacks core.subjects', async () => {
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(),
      limits: PLANS.essentiel.limits,
    };
    useCase = new ListSubjectsWithUsage(subjects, new PlanPolicy(planWithout));

    await expect(useCase.execute({ centerCode: CENTER })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
