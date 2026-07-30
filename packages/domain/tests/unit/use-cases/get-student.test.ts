import { describe, it, expect, beforeEach } from 'vitest';
import { GetStudent } from '../../../src/use-cases/get-student';
import { ArchiveStudent } from '../../../src/use-cases/archive-student';
import { CreateStudent, type CreateStudentInput } from '../../../src/use-cases/create-student';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { StudentId } from '../../../src/entities/student';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryStudentRepository } from '../fakes/in-memory-student-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

function validInput(): CreateStudentInput {
  return {
    name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    birthDate: '2010-01-01',
    level: '2 Bac SM',
    school: null,
    notes: null,
    guardianIds: [],
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
  };
}

function planWithoutStudents(): Plan {
  return { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };
}

describe('GetStudent', () => {
  let students: InMemoryStudentRepository;
  let create: CreateStudent;
  let get: GetStudent;
  let archive: ArchiveStudent;

  beforeEach(() => {
    students = new InMemoryStudentRepository();
    const plan = new PlanPolicy(PLANS.essentiel);
    create = new CreateStudent(students, fakeClock(), fakeIds(), plan);
    get = new GetStudent(students, plan);
    archive = new ArchiveStudent(students, fakeClock(), plan);
  });

  it('returns the student for a known id', async () => {
    const created = await create.execute(validInput());
    const found = await get.execute({ id: created.id });
    expect(found?.id).toBe(created.id);
    expect(found?.name.fr).toBe('Yassine Alaoui');
  });

  it('returns null for an unknown id', async () => {
    expect(await get.execute({ id: 'stu_does-not-exist' as StudentId })).toBeNull();
  });

  it('returns null for an archived student (tombstone hidden)', async () => {
    const created = await create.execute(validInput());
    await archive.execute({ id: created.id });
    expect(await get.execute({ id: created.id })).toBeNull();
  });

  it('is gated by core.students', async () => {
    const locked = new GetStudent(students, new PlanPolicy(planWithoutStudents()));
    await expect(locked.execute({ id: 'stu_x' as StudentId })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
