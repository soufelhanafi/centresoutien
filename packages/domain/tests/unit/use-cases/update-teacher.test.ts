import { describe, it, expect, beforeEach } from 'vitest';
import { CreateTeacher } from '../../../src/use-cases/create-teacher';
import { UpdateTeacher, type UpdateTeacherInput } from '../../../src/use-cases/update-teacher';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { TeacherNotFoundError } from '../../../src/errors/people-errors';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { SubjectId } from '../../../src/entities/subject';
import type { Teacher, TeacherId } from '../../../src/entities/teacher';
import { InMemoryTeacherRepository } from '../fakes/in-memory-teacher-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const EDITOR = 'usr_00000000000000000000000002' as UserId;
const SUB_MATH = 'sub_00000000000000000000000001' as SubjectId;
const SUB_PHYS = 'sub_00000000000000000000000002' as SubjectId;

async function seedTeacher(
  repo: InMemoryTeacherRepository,
  clock = fakeClock('2026-07-29T10:00:00Z'),
): Promise<Teacher> {
  const create = new CreateTeacher(repo, clock, fakeIds(), new PlanPolicy(PLANS.pro));
  return create.execute({
    name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    cin: 'AB12345',
    phone: '0612345678',
    email: 'yassine@centre.ma',
    subjectIds: [SUB_MATH],
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
  });
}

function editInput(id: TeacherId, over: Partial<UpdateTeacherInput> = {}): UpdateTeacherInput {
  return {
    name: { fr: 'Yassine A.', ar: 'ياسين' },
    cin: 'CD67890',
    phone: '0655555555',
    email: null,
    subjectIds: [SUB_MATH, SUB_PHYS],
    niveauIds: [],
    centerCode: CENTER,
    id,
    updatedBy: EDITOR,
    ...over,
  };
}

describe('UpdateTeacher', () => {
  let teachers: InMemoryTeacherRepository;
  let clock: ReturnType<typeof fakeClock>;
  let useCase: UpdateTeacher;

  beforeEach(() => {
    teachers = new InMemoryTeacherRepository();
    clock = fakeClock('2026-07-29T10:00:00Z');
    useCase = new UpdateTeacher(teachers, clock, new PlanPolicy(PLANS.pro));
  });

  it('updates editable fields, advancing updatedAt + updatedBy', async () => {
    const original = await seedTeacher(teachers, clock);
    clock.advance(60_000);

    const updated = await useCase.execute(editInput(original.id));

    expect(updated.name).toEqual({ fr: 'Yassine A.', ar: 'ياسين' });
    expect(updated.cin).toBe('CD67890');
    expect(updated.phone).toBe('+212655555555');
    expect(updated.email).toBeNull();
    expect(updated.subjectIds).toEqual([SUB_MATH, SUB_PHYS]);
    expect(updated.updatedBy).toBe(EDITOR);
    expect(updated.updatedAt).toEqual(new Date('2026-07-29T10:01:00Z'));
    expect(await teachers.findById(original.id)).toEqual(updated);
  });

  it('replaces the whole niveauIds set (many-to-many retrofit, SOU-260)', async () => {
    const original = await seedTeacher(teachers, clock);
    clock.advance(60_000);

    const assigned = await useCase.execute(
      editInput(original.id, {
        niveauIds: ['niv_00000000000000000000000001', 'niv_00000000000000000000000002'],
      }),
    );
    expect(assigned.niveauIds).toEqual(['niv_00000000000000000000000001', 'niv_00000000000000000000000002']);

    const cleared = await useCase.execute(editInput(original.id, { niveauIds: [] }));
    expect(cleared.niveauIds).toEqual([]);
  });

  it('preserves identity, provenance, active, version, and the immutable naturalKey', async () => {
    const original = await seedTeacher(teachers, clock);
    clock.advance(60_000);

    const updated = await useCase.execute(editInput(original.id));

    expect(updated.id).toBe(original.id);
    expect(updated.centerCode).toBe(original.centerCode);
    expect(updated.deviceOrigin).toBe(original.deviceOrigin);
    expect(updated.createdAt).toEqual(original.createdAt);
    expect(updated.active).toBe(original.active);
    // The optimistic-concurrency counter is the hub's to bump, never the use case's.
    expect(updated.version).toBe(original.version);
    // naturalKey is stamped once and never recomputed — even though name + phone changed.
    expect(updated.naturalKey).toBe(original.naturalKey);
  });

  it('is a no-op when no field changed: preserves updatedAt/updatedBy and emits no spurious sync delta', async () => {
    const original = await seedTeacher(teachers, clock);
    clock.advance(60_000);

    // Re-submit the seeded values verbatim (phone re-normalizes to the same E.164).
    const result = await useCase.execute(
      editInput(original.id, {
        name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
        cin: 'AB12345',
        phone: '0612345678',
        email: 'yassine@centre.ma',
        subjectIds: [SUB_MATH],
      }),
    );

    // applyWrite returns the row untouched: no bump to updatedAt/updatedBy despite the advanced clock.
    expect(result).toEqual(original);
    expect(result.updatedAt).toEqual(original.updatedAt);
    expect(result.updatedBy).toBe(original.updatedBy);
  });

  it('throws TeacherNotFoundError for an unknown id', async () => {
    await expect(
      useCase.execute(editInput('tch_00000000000000000000000099' as TeacherId)),
    ).rejects.toBeInstanceOf(TeacherNotFoundError);
  });

  it('throws TeacherNotFoundError for an archived id (soft-deleted rows are not editable)', async () => {
    const original = await seedTeacher(teachers, clock);
    await teachers.softDelete(original.id, new Date('2026-08-01T00:00:00Z'), USER);

    await expect(useCase.execute(editInput(original.id))).rejects.toBeInstanceOf(
      TeacherNotFoundError,
    );
  });

  it('treats a foreign-center id as not found (tenant scoping)', async () => {
    const original = await seedTeacher(teachers, clock);
    await expect(
      useCase.execute(editInput(original.id, { centerCode: 'CS-RABAT-002' as CenterCode })),
    ).rejects.toBeInstanceOf(TeacherNotFoundError);
  });

  it('throws PlanFeatureUnavailableError when the plan lacks core.teachers', async () => {
    const original = await seedTeacher(teachers, clock);
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(['core.students']),
      limits: PLANS.essentiel.limits,
    };
    useCase = new UpdateTeacher(teachers, clock, new PlanPolicy(planWithout));

    await expect(useCase.execute(editInput(original.id))).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
