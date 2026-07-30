import { describe, it, expect, beforeEach } from 'vitest';
import { UpdateStudent } from '../../../src/use-cases/update-student';
import { CreateStudent, type CreateStudentInput } from '../../../src/use-cases/create-student';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { StudentNotFoundError } from '../../../src/errors/student-errors';
import type { StudentId } from '../../../src/entities/student';
import type { StudentInput } from '../../../src/schemas/student';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryStudentRepository } from '../fakes/in-memory-student-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const EDITOR = 'usr_00000000000000000000000002' as UserId;

function createInput(): CreateStudentInput {
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

function editFields(overrides: Partial<StudentInput> = {}): StudentInput {
  return {
    name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    birthDate: '2010-01-01',
    level: '2 Bac SM',
    school: null,
    notes: null,
    guardianIds: [],
    ...overrides,
  };
}

function planWithoutStudents(): Plan {
  return { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };
}

describe('UpdateStudent', () => {
  let students: InMemoryStudentRepository;
  let clock: ReturnType<typeof fakeClock>;
  let create: CreateStudent;
  let update: UpdateStudent;

  beforeEach(() => {
    students = new InMemoryStudentRepository();
    clock = fakeClock('2026-07-28T10:00:00Z');
    const plan = new PlanPolicy(PLANS.essentiel);
    create = new CreateStudent(students, clock, fakeIds(), plan);
    update = new UpdateStudent(students, clock, plan);
  });

  it('edits fields and advances updatedAt + updatedBy, preserving identity', async () => {
    const created = await create.execute(createInput());
    clock.advance(60_000);

    const updated = await update.execute({
      id: created.id,
      updatedBy: EDITOR,
      ...editFields({ level: '1 Bac SE', school: 'Lycée Ibn Sina' }),
    });

    expect(updated.level).toBe('1 Bac SE');
    expect(updated.school).toBe('Lycée Ibn Sina');
    expect(updated.updatedBy).toBe(EDITOR);
    expect(updated.updatedAt.toISOString()).toBe('2026-07-28T10:01:00.000Z');
    // Identity + provenance untouched.
    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toEqual(created.createdAt);
    expect(updated.version).toBe(created.version);
    expect(updated.deviceOrigin).toBe(created.deviceOrigin);
  });

  it('never recomputes naturalKey, even when the name changes', async () => {
    const created = await create.execute(createInput());
    const updated = await update.execute({
      id: created.id,
      updatedBy: EDITOR,
      ...editFields({ name: { fr: 'Yassine El Alaoui', ar: 'ياسين' } }),
    });
    expect(updated.naturalKey).toBe(created.naturalKey);
  });

  it('persists the change (a subsequent read reflects it)', async () => {
    const created = await create.execute(createInput());
    await update.execute({ id: created.id, updatedBy: EDITOR, ...editFields({ level: '3AC' }) });
    expect((await students.findById(created.id))?.level).toBe('3AC');
  });

  it('throws StudentNotFoundError for an unknown id', async () => {
    await expect(
      update.execute({ id: 'stu_missing' as StudentId, updatedBy: EDITOR, ...editFields() }),
    ).rejects.toBeInstanceOf(StudentNotFoundError);
  });

  it('is gated by core.students', async () => {
    const locked = new UpdateStudent(students, clock, new PlanPolicy(planWithoutStudents()));
    await expect(
      locked.execute({ id: 'stu_x' as StudentId, updatedBy: EDITOR, ...editFields() }),
    ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
  });
});
