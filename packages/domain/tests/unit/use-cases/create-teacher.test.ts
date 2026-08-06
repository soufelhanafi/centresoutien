import { describe, it, expect, beforeEach } from 'vitest';
import { CreateTeacher, type CreateTeacherInput } from '../../../src/use-cases/create-teacher';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError, PlanLimitExceededError } from '../../../src/errors/plan-errors';
import { DuplicateTeacherError } from '../../../src/errors/people-errors';
import { buildTeacherNaturalKey } from '../../../src/policies/natural-key';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { SubjectId } from '../../../src/entities/subject';
import { InMemoryTeacherRepository } from '../fakes/in-memory-teacher-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import { planWithLimits } from '../fakes/plans';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const SUB_MATH = 'sub_00000000000000000000000001' as SubjectId;

function validInput(overrides: Partial<CreateTeacherInput> = {}): CreateTeacherInput {
  return {
    name: { fr: '  Yassine Alaoui ', ar: ' ياسين العلوي ' },
    cin: '  AB12345 ',
    phone: '06 12 34 56 78',
    email: '  yassine@centre.ma ',
    subjectIds: [SUB_MATH],
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

describe('CreateTeacher', () => {
  let teachers: InMemoryTeacherRepository;
  let useCase: CreateTeacher;

  beforeEach(() => {
    teachers = new InMemoryTeacherRepository();
    // core.teachers lives on every plan — build the policy from one that has it.
    useCase = new CreateTeacher(
      teachers,
      fakeClock('2026-07-29T10:00:00Z'),
      fakeIds(),
      new PlanPolicy(PLANS.pro),
    );
  });

  describe('happy path', () => {
    it('creates a teacher with a prefixed id, normalized phone, trimmed fields, and a fresh envelope', async () => {
      const teacher = await useCase.execute(validInput());

      expect(teacher.id).toMatch(/^tch_/);
      expect(teacher.name).toEqual({ fr: 'Yassine Alaoui', ar: 'ياسين العلوي' });
      expect(teacher.cin).toBe('AB12345');
      expect(teacher.phone).toBe('+212612345678');
      expect(teacher.email).toBe('yassine@centre.ma');
      expect(teacher.subjectIds).toEqual([SUB_MATH]);
      expect(teacher.active).toBe(true);
      expect(teacher.centerCode).toBe(CENTER);
      expect(teacher.deviceOrigin).toBe(DEVICE);
      expect(teacher.updatedBy).toBe(USER);
      expect(teacher.createdAt).toEqual(new Date('2026-07-29T10:00:00Z'));
      expect(teacher.updatedAt).toEqual(teacher.createdAt);
      expect(teacher.deletedAt).toBeNull();
      expect(teacher.version).toBe(0);
    });

    it('derives the naturalKey from the center + bilingual name + canonical phone', async () => {
      const teacher = await useCase.execute(validInput());
      expect(teacher.naturalKey).toBe(
        buildTeacherNaturalKey({
          centerCode: CENTER,
          name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
          phone: '+212612345678',
        }),
      );
      expect(await teachers.findByNaturalKey(teacher.naturalKey)).toEqual(teacher);
    });

    it('collapses blank cin and email to null and defaults subjectIds to empty', async () => {
      const teacher = await useCase.execute(validInput({ cin: '   ', email: '  ', subjectIds: [] }));
      expect(teacher.cin).toBeNull();
      expect(teacher.email).toBeNull();
      expect(teacher.subjectIds).toEqual([]);
    });

    it('persists the teacher so it can be read back by id', async () => {
      const teacher = await useCase.execute(validInput());
      expect(await teachers.findById(teacher.id)).toEqual(teacher);
    });
  });

  describe('shared phone', () => {
    it('allows two teachers on the same number (different names → both saved)', async () => {
      const first = await useCase.execute(
        validInput({ name: { fr: 'Yassine Alaoui', ar: 'ياسين' }, phone: '0612345678' }),
      );
      const second = await useCase.execute(
        validInput({ name: { fr: 'Salma Idrissi', ar: 'سلمى' }, phone: '0612345678' }),
      );

      expect(first.phone).toBe(second.phone);
      expect(first.naturalKey).not.toBe(second.naturalKey);
      expect(teachers.all()).toHaveLength(2);
    });
  });

  describe('exact duplicate', () => {
    it('rejects a same-name + same-phone teacher with a typed DuplicateTeacherError and saves nothing new', async () => {
      const first = await useCase.execute(validInput());

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(DuplicateTeacherError);
      await expect(useCase.execute(validInput())).rejects.toMatchObject({
        naturalKey: first.naturalKey,
      });
      expect(teachers.all()).toHaveLength(1);
    });

    it('allows recreating a teacher whose only match was soft-deleted (tombstone frees the key)', async () => {
      const first = await useCase.execute(validInput());
      await teachers.softDelete(first.id, new Date('2026-08-02T00:00:00Z'), USER);

      const recreated = await useCase.execute(validInput());
      expect(recreated.id).not.toBe(first.id);
      expect(recreated.naturalKey).toBe(first.naturalKey);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.teachers', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(['core.students']),
        limits: PLANS.essentiel.limits,
      };
      useCase = new CreateTeacher(teachers, fakeClock(), fakeIds(), new PlanPolicy(planWithout));

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(teachers.all()).toHaveLength(0);
    });

    it('throws PlanLimitExceededError once maxTeachers is reached (cap: 2)', async () => {
      useCase = new CreateTeacher(
        teachers,
        fakeClock(),
        fakeIds(),
        new PlanPolicy(planWithLimits({ maxTeachers: 2 })),
      );
      await useCase.execute(validInput({ name: { fr: 'T One', ar: 'واحد' }, phone: '0611111111' }));
      await useCase.execute(validInput({ name: { fr: 'T Two', ar: 'اثنان' }, phone: '0622222222' }));

      await expect(
        useCase.execute(validInput({ name: { fr: 'T Three', ar: 'ثلاثة' }, phone: '0633333333' })),
      ).rejects.toBeInstanceOf(PlanLimitExceededError);
      expect(teachers.all()).toHaveLength(2);
    });
  });

  describe('validation', () => {
    it('rejects a blank FR name', async () => {
      await expect(
        useCase.execute(validInput({ name: { fr: '  ', ar: 'ياسين' } })),
      ).rejects.toThrow();
      expect(teachers.all()).toHaveLength(0);
    });

    it('rejects a missing phone (the required matching anchor)', async () => {
      await expect(useCase.execute(validInput({ phone: '' }))).rejects.toThrow();
    });

    it('rejects a garbage phone', async () => {
      await expect(useCase.execute(validInput({ phone: 'abc' }))).rejects.toThrow();
    });

    it('rejects a subject id without the sub_ prefix', async () => {
      await expect(
        useCase.execute(validInput({ subjectIds: ['not-a-subject'] as unknown as SubjectId[] })),
      ).rejects.toThrow();
    });
  });
});
