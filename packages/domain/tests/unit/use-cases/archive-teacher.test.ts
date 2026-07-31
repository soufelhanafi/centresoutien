import { describe, it, expect, beforeEach } from 'vitest';
import { CreateTeacher } from '../../../src/use-cases/create-teacher';
import { ArchiveTeacher } from '../../../src/use-cases/archive-teacher';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { TeacherInUseError, TeacherNotFoundError } from '../../../src/errors/people-errors';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { Teacher, TeacherId } from '../../../src/entities/teacher';
import { InMemoryTeacherRepository } from '../fakes/in-memory-teacher-repository';
import { fakeTeacherReference } from '../fakes/fake-teacher-reference';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const DELETER = 'usr_00000000000000000000000002' as UserId;

async function seed(repo: InMemoryTeacherRepository, clock = fakeClock()): Promise<Teacher> {
  const create = new CreateTeacher(repo, clock, fakeIds(), new PlanPolicy(PLANS.pro));
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

describe('ArchiveTeacher', () => {
  let teachers: InMemoryTeacherRepository;
  let clock: ReturnType<typeof fakeClock>;

  beforeEach(() => {
    teachers = new InMemoryTeacherRepository();
    clock = fakeClock('2026-07-29T10:00:00Z');
  });

  it('soft-deletes a free teacher, stamping the deleter on the tombstone', async () => {
    const teacher = await seed(teachers, clock);
    clock.advance(3_600_000);
    const useCase = new ArchiveTeacher(
      teachers,
      fakeTeacherReference(),
      clock,
      new PlanPolicy(PLANS.pro),
    );

    await useCase.execute({ centerCode: CENTER, id: teacher.id, updatedBy: DELETER });

    // Hidden from live reads…
    expect(await teachers.findById(teacher.id)).toBeNull();
    // …but present as a tombstone in the sync feed, carrying who + when.
    const changed = await teachers.listChangedSince(new Date('2026-07-01T00:00:00Z'));
    expect(changed).toHaveLength(1);
    expect(changed[0]?.deletedAt).toEqual(new Date('2026-07-29T11:00:00Z'));
    expect(changed[0]?.updatedBy).toBe(DELETER);
  });

  it('rejects archiving a teacher still referenced (in-use guard seam) and leaves it live', async () => {
    const teacher = await seed(teachers, clock);
    const useCase = new ArchiveTeacher(
      teachers,
      fakeTeacherReference([teacher.id]),
      clock,
      new PlanPolicy(PLANS.pro),
    );

    await expect(
      useCase.execute({ centerCode: CENTER, id: teacher.id, updatedBy: DELETER }),
    ).rejects.toBeInstanceOf(TeacherInUseError);
    expect(await teachers.findById(teacher.id)).not.toBeNull();
  });

  it('throws TeacherNotFoundError for an unknown id', async () => {
    const useCase = new ArchiveTeacher(
      teachers,
      fakeTeacherReference(),
      clock,
      new PlanPolicy(PLANS.pro),
    );
    await expect(
      useCase.execute({
        centerCode: CENTER,
        id: 'tch_00000000000000000000000099' as TeacherId,
        updatedBy: DELETER,
      }),
    ).rejects.toBeInstanceOf(TeacherNotFoundError);
  });

  it('throws TeacherNotFoundError when archiving an already-archived teacher', async () => {
    const teacher = await seed(teachers, clock);
    const useCase = new ArchiveTeacher(
      teachers,
      fakeTeacherReference(),
      clock,
      new PlanPolicy(PLANS.pro),
    );
    await useCase.execute({ centerCode: CENTER, id: teacher.id, updatedBy: DELETER });

    await expect(
      useCase.execute({ centerCode: CENTER, id: teacher.id, updatedBy: DELETER }),
    ).rejects.toBeInstanceOf(TeacherNotFoundError);
  });

  it('treats a foreign-center id as not found (tenant scoping)', async () => {
    const teacher = await seed(teachers, clock);
    const useCase = new ArchiveTeacher(
      teachers,
      fakeTeacherReference(),
      clock,
      new PlanPolicy(PLANS.pro),
    );
    await expect(
      useCase.execute({ centerCode: 'CS-RABAT-002' as CenterCode, id: teacher.id, updatedBy: DELETER }),
    ).rejects.toBeInstanceOf(TeacherNotFoundError);
    expect(await teachers.findById(teacher.id)).not.toBeNull();
  });

  it('throws PlanFeatureUnavailableError when the plan lacks core.teachers', async () => {
    const teacher = await seed(teachers, clock);
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(['core.students']),
      limits: PLANS.essentiel.limits,
    };
    const useCase = new ArchiveTeacher(
      teachers,
      fakeTeacherReference(),
      clock,
      new PlanPolicy(planWithout),
    );
    await expect(
      useCase.execute({ centerCode: CENTER, id: teacher.id, updatedBy: DELETER }),
    ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
  });
});
