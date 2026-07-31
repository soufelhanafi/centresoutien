import { describe, it, expect, beforeEach } from 'vitest';
import { CreateTeacher } from '../../../src/use-cases/create-teacher';
import { GetTeacher } from '../../../src/use-cases/get-teacher';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { Teacher, TeacherId } from '../../../src/entities/teacher';
import { InMemoryTeacherRepository } from '../fakes/in-memory-teacher-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

async function seed(repo: InMemoryTeacherRepository): Promise<Teacher> {
  const create = new CreateTeacher(repo, fakeClock(), fakeIds(), new PlanPolicy(PLANS.pro));
  return create.execute({
    name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    cin: null,
    phone: '0612345678',
    email: null,
    subjectIds: [],
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
  });
}

describe('GetTeacher', () => {
  let teachers: InMemoryTeacherRepository;
  let useCase: GetTeacher;

  beforeEach(() => {
    teachers = new InMemoryTeacherRepository();
    useCase = new GetTeacher(teachers, new PlanPolicy(PLANS.pro));
  });

  it('returns the teacher for a known live id', async () => {
    const teacher = await seed(teachers);
    expect(await useCase.execute({ centerCode: CENTER, id: teacher.id })).toEqual(teacher);
  });

  it('returns null for an unknown id', async () => {
    expect(
      await useCase.execute({ centerCode: CENTER, id: 'tch_00000000000000000000000099' as TeacherId }),
    ).toBeNull();
  });

  it('returns null for an archived id (tombstones collapse to not-found)', async () => {
    const teacher = await seed(teachers);
    await teachers.softDelete(teacher.id, new Date('2026-08-01T00:00:00Z'), USER);
    expect(await useCase.execute({ centerCode: CENTER, id: teacher.id })).toBeNull();
  });

  it('returns null for a foreign-center id (tenant scoping)', async () => {
    const teacher = await seed(teachers);
    expect(
      await useCase.execute({ centerCode: 'CS-RABAT-002' as CenterCode, id: teacher.id }),
    ).toBeNull();
  });

  it('throws PlanFeatureUnavailableError when the plan lacks core.teachers', async () => {
    const teacher = await seed(teachers);
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(['core.students']),
      limits: PLANS.essentiel.limits,
    };
    useCase = new GetTeacher(teachers, new PlanPolicy(planWithout));
    await expect(
      useCase.execute({ centerCode: CENTER, id: teacher.id }),
    ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
  });
});
