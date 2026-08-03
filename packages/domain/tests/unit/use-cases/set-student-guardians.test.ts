import { describe, it, expect, beforeEach } from 'vitest';
import { SetStudentGuardians } from '../../../src/use-cases/set-student-guardians';
import { CreateStudent, type CreateStudentInput } from '../../../src/use-cases/create-student';
import { CreateParent, type CreateParentInput } from '../../../src/use-cases/create-parent';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { StudentNotFoundError, StudentVersionConflictError } from '../../../src/errors/student-errors';
import { ParentNotFoundError } from '../../../src/errors/people-errors';
import type { StudentId } from '../../../src/entities/student';
import type { ParentId } from '../../../src/entities/parent';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryStudentRepository } from '../fakes/in-memory-student-repository';
import { InMemoryParentRepository } from '../fakes/in-memory-parent-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const EDITOR = 'usr_00000000000000000000000002' as UserId;

function createStudentInput(): CreateStudentInput {
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

function createParentInput(overrides: Partial<CreateParentInput> = {}): CreateParentInput {
  return {
    name: 'Karim Alaoui',
    phone: '+212600000001',
    email: null,
    relation: 'pere',
    whatsappOptIn: false,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

function planWithoutStudents(): Plan {
  return { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };
}

describe('SetStudentGuardians', () => {
  let students: InMemoryStudentRepository;
  let parents: InMemoryParentRepository;
  let clock: ReturnType<typeof fakeClock>;
  let createStudent: CreateStudent;
  let createParent: CreateParent;
  let setGuardians: SetStudentGuardians;

  beforeEach(() => {
    students = new InMemoryStudentRepository();
    parents = new InMemoryParentRepository();
    clock = fakeClock('2026-07-28T10:00:00Z');
    const plan = new PlanPolicy(PLANS.essentiel);
    createStudent = new CreateStudent(students, clock, fakeIds(), plan);
    createParent = new CreateParent(parents, clock, fakeIds(), plan);
    setGuardians = new SetStudentGuardians(students, parents, clock, plan);
  });

  it('sets guardianIds and advances updatedAt/updatedBy, without touching other fields', async () => {
    const student = await createStudent.execute(createStudentInput());
    const guardian = await createParent.execute(createParentInput());
    clock.advance(60_000);

    const updated = await setGuardians.execute({
      centerCode: CENTER,
      id: student.id,
      updatedBy: EDITOR,
      guardianIds: [guardian.id],
      expectedVersion: student.version,
    });

    expect(updated.guardianIds).toEqual([guardian.id]);
    expect(updated.updatedBy).toBe(EDITOR);
    expect(updated.updatedAt.toISOString()).toBe('2026-07-28T10:01:00.000Z');
    // Untouched fields.
    expect(updated.name).toEqual(student.name);
    expect(updated.level).toBe(student.level);
    expect(updated.notes).toBe(student.notes);
    // Identity + provenance untouched; version is hub-assigned, never bumped here.
    expect(updated.id).toBe(student.id);
    expect(updated.createdAt).toEqual(student.createdAt);
    expect(updated.version).toBe(student.version);
    expect(updated.deviceOrigin).toBe(student.deviceOrigin);
  });

  it('persists the change (a subsequent read reflects it)', async () => {
    const student = await createStudent.execute(createStudentInput());
    const guardian = await createParent.execute(createParentInput());

    await setGuardians.execute({
      centerCode: CENTER,
      id: student.id,
      updatedBy: EDITOR,
      guardianIds: [guardian.id],
      expectedVersion: student.version,
    });

    expect((await students.findById(student.id))?.guardianIds).toEqual([guardian.id]);
  });

  it('clears guardianIds when given an empty array', async () => {
    const student = await createStudent.execute(createStudentInput());
    const guardian = await createParent.execute(createParentInput());
    const linked = await setGuardians.execute({
      centerCode: CENTER,
      id: student.id,
      updatedBy: EDITOR,
      guardianIds: [guardian.id],
      expectedVersion: student.version,
    });

    const unlinked = await setGuardians.execute({
      centerCode: CENTER,
      id: student.id,
      updatedBy: EDITOR,
      guardianIds: [],
      expectedVersion: linked.version,
    });

    expect(unlinked.guardianIds).toEqual([]);
  });

  it('throws StudentNotFoundError for an unknown id', async () => {
    await expect(
      setGuardians.execute({
        centerCode: CENTER,
        id: 'stu_missing' as StudentId,
        updatedBy: EDITOR,
        guardianIds: [],
        expectedVersion: 0,
      }),
    ).rejects.toBeInstanceOf(StudentNotFoundError);
  });

  it('throws StudentNotFoundError for a student in another center (tenant scope)', async () => {
    const student = await createStudent.execute(createStudentInput());
    await expect(
      setGuardians.execute({
        centerCode: 'CS-RABAT-002' as CenterCode,
        id: student.id,
        updatedBy: EDITOR,
        guardianIds: [],
        expectedVersion: student.version,
      }),
    ).rejects.toBeInstanceOf(StudentNotFoundError);
  });

  it('throws StudentVersionConflictError when expectedVersion is stale', async () => {
    const student = await createStudent.execute(createStudentInput());

    await expect(
      setGuardians.execute({
        centerCode: CENTER,
        id: student.id,
        updatedBy: EDITOR,
        guardianIds: [],
        expectedVersion: student.version + 1,
      }),
    ).rejects.toBeInstanceOf(StudentVersionConflictError);
  });

  it('throws ParentNotFoundError for an unknown guardian id', async () => {
    const student = await createStudent.execute(createStudentInput());

    await expect(
      setGuardians.execute({
        centerCode: CENTER,
        id: student.id,
        updatedBy: EDITOR,
        guardianIds: ['prt_00000000000000000000000009' as ParentId],
        expectedVersion: student.version,
      }),
    ).rejects.toBeInstanceOf(ParentNotFoundError);
  });

  it('throws ParentNotFoundError for an archived guardian id', async () => {
    const student = await createStudent.execute(createStudentInput());
    const guardian = await createParent.execute(createParentInput());
    await parents.softDelete(guardian.id, clock.now(), USER);

    await expect(
      setGuardians.execute({
        centerCode: CENTER,
        id: student.id,
        updatedBy: EDITOR,
        guardianIds: [guardian.id],
        expectedVersion: student.version,
      }),
    ).rejects.toBeInstanceOf(ParentNotFoundError);
  });

  it('throws ParentNotFoundError for a guardian in another center', async () => {
    const student = await createStudent.execute(createStudentInput());
    const guardian = await createParent.execute(
      createParentInput({ centerCode: 'CS-RABAT-002' as CenterCode }),
    );

    await expect(
      setGuardians.execute({
        centerCode: CENTER,
        id: student.id,
        updatedBy: EDITOR,
        guardianIds: [guardian.id],
        expectedVersion: student.version,
      }),
    ).rejects.toBeInstanceOf(ParentNotFoundError);
  });

  it('is gated by core.students', async () => {
    const locked = new SetStudentGuardians(students, parents, clock, new PlanPolicy(planWithoutStudents()));
    await expect(
      locked.execute({
        centerCode: CENTER,
        id: 'stu_x' as StudentId,
        updatedBy: EDITOR,
        guardianIds: [],
        expectedVersion: 0,
      }),
    ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
  });
});
