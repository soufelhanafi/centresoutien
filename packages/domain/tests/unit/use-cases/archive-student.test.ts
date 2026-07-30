import { describe, it, expect, beforeEach } from 'vitest';
import { ArchiveStudent } from '../../../src/use-cases/archive-student';
import { CreateStudent, type CreateStudentInput } from '../../../src/use-cases/create-student';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { StudentNotFoundError } from '../../../src/errors/student-errors';
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

describe('ArchiveStudent', () => {
  let students: InMemoryStudentRepository;
  let clock: ReturnType<typeof fakeClock>;
  let create: CreateStudent;
  let archive: ArchiveStudent;

  beforeEach(() => {
    students = new InMemoryStudentRepository();
    clock = fakeClock('2026-07-28T10:00:00Z');
    const plan = new PlanPolicy(PLANS.essentiel);
    create = new CreateStudent(students, clock, fakeIds(), plan);
    archive = new ArchiveStudent(students, clock, plan);
  });

  it('soft-deletes: the row disappears from reads and the active count', async () => {
    const created = await create.execute(validInput());
    expect(await students.countActive(CENTER)).toBe(1);

    await archive.execute({ centerCode: CENTER, id: created.id, updatedBy: USER });

    expect(await students.findById(created.id)).toBeNull();
    expect(await students.countActive(CENTER)).toBe(0);
  });

  it('never hard-deletes — the tombstone records who and survives for sync', async () => {
    const created = await create.execute(validInput());
    await archive.execute({ centerCode: CENTER, id: created.id, updatedBy: USER });
    const tombstone = students.all().find((s) => s.id === created.id);
    expect(tombstone).toBeDefined();
    expect(tombstone?.deletedAt).not.toBeNull();
    expect(tombstone?.updatedBy).toBe(USER);
  });

  it('throws StudentNotFoundError for an unknown id', async () => {
    await expect(
      archive.execute({ centerCode: CENTER, id: 'stu_missing' as StudentId, updatedBy: USER }),
    ).rejects.toBeInstanceOf(StudentNotFoundError);
  });

  it('throws StudentNotFoundError for a student in another center (tenant scope)', async () => {
    const created = await create.execute(validInput());
    await expect(
      archive.execute({
        centerCode: 'CS-RABAT-002' as CenterCode,
        id: created.id,
        updatedBy: USER,
      }),
    ).rejects.toBeInstanceOf(StudentNotFoundError);
    // The foreign-tenant attempt must not have tombstoned the real row.
    expect(await students.findById(created.id)).not.toBeNull();
  });

  it('throws StudentNotFoundError when the student is already archived', async () => {
    const created = await create.execute(validInput());
    await archive.execute({ centerCode: CENTER, id: created.id, updatedBy: USER });
    await expect(archive.execute({ centerCode: CENTER, id: created.id, updatedBy: USER })).rejects.toBeInstanceOf(StudentNotFoundError);
  });

  it('is gated by core.students', async () => {
    const locked = new ArchiveStudent(students, clock, new PlanPolicy(planWithoutStudents()));
    await expect(
      locked.execute({ centerCode: CENTER, id: 'stu_x' as StudentId, updatedBy: USER }),
    ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
  });
});
