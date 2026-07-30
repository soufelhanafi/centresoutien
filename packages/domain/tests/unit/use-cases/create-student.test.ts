import { describe, it, expect, beforeEach } from 'vitest';
import { CreateStudent, type CreateStudentInput } from '../../../src/use-cases/create-student';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError, PlanLimitExceededError } from '../../../src/errors/plan-errors';
import { buildStudentNaturalKey } from '../../../src/policies/natural-key';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryStudentRepository } from '../fakes/in-memory-student-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const PARENT = 'prt_00000000000000000000000001';

function validInput(overrides: Partial<CreateStudentInput> = {}): CreateStudentInput {
  return {
    name: { fr: '  Yassine Alaoui ', ar: ' ياسين العلوي ' },
    birthDate: '2012-05-03',
    level: '  3AC ',
    school: null,
    notes: null,
    guardianIds: [],
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

/** A plan identical to `essentiel` but with a tiny student cap, for limit tests. */
function planWithMaxStudents(max: number): Plan {
  return {
    id: 'essentiel',
    features: PLANS.essentiel.features,
    limits: { ...PLANS.essentiel.limits, maxStudents: max },
  };
}

describe('CreateStudent', () => {
  let students: InMemoryStudentRepository;
  let useCase: CreateStudent;

  beforeEach(() => {
    students = new InMemoryStudentRepository();
    useCase = new CreateStudent(
      students,
      fakeClock('2026-07-29T10:00:00Z'),
      fakeIds(),
      new PlanPolicy(PLANS.essentiel),
    );
  });

  describe('happy path', () => {
    it('creates a student with a prefixed id, trimmed fields, and a fresh envelope', async () => {
      const student = await useCase.execute(validInput());

      expect(student.id).toMatch(/^stu_/);
      expect(student.name).toEqual({ fr: 'Yassine Alaoui', ar: 'ياسين العلوي' });
      expect(student.birthDate).toBe('2012-05-03');
      expect(student.level).toBe('3AC');
      expect(student.school).toBeNull();
      expect(student.notes).toBeNull();
      expect(student.guardianIds).toEqual([]);
      expect(student.centerCode).toBe(CENTER);
      expect(student.deviceOrigin).toBe(DEVICE);
      expect(student.updatedBy).toBe(USER);
      expect(student.createdAt).toEqual(new Date('2026-07-29T10:00:00Z'));
      expect(student.updatedAt).toEqual(student.createdAt);
      expect(student.deletedAt).toBeNull();
      expect(student.version).toBe(0);
    });

    it('stamps a naturalKey derived from center, name, and birth date', async () => {
      const student = await useCase.execute(validInput());
      expect(student.naturalKey).toBe(
        buildStudentNaturalKey({
          centerCode: CENTER,
          name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
          birthDate: '2012-05-03',
        }),
      );
    });

    it('collapses empty optional text to null and keeps provided values', async () => {
      const student = await useCase.execute(validInput({ school: 'Lycée Ibn Sina', notes: '   ' }));
      expect(student.school).toBe('Lycée Ibn Sina');
      expect(student.notes).toBeNull();
    });

    it('keeps provided guardian links', async () => {
      const student = await useCase.execute(validInput({ guardianIds: [PARENT] }));
      expect(student.guardianIds).toEqual([PARENT]);
    });

    it('persists the student so it can be read back by id', async () => {
      const student = await useCase.execute(validInput());
      expect(await students.findById(student.id)).toEqual(student);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.students', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      useCase = new CreateStudent(students, fakeClock(), fakeIds(), new PlanPolicy(planWithout));

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
      expect(students.all()).toHaveLength(0);
    });
  });

  describe('plan limits', () => {
    it('throws PlanLimitExceededError once maxStudents live students exist', async () => {
      useCase = new CreateStudent(
        students,
        fakeClock(),
        fakeIds(),
        new PlanPolicy(planWithMaxStudents(1)),
      );

      await useCase.execute(validInput({ name: { fr: 'Sara', ar: 'سارة' }, birthDate: '2010-01-01' }));

      await expect(
        useCase.execute(validInput({ name: { fr: 'Omar', ar: 'عمر' }, birthDate: '2011-02-02' })),
      ).rejects.toBeInstanceOf(PlanLimitExceededError);
      expect(students.all()).toHaveLength(1);
    });

    it('does not count soft-deleted students against the limit', async () => {
      useCase = new CreateStudent(
        students,
        fakeClock(),
        fakeIds(),
        new PlanPolicy(planWithMaxStudents(1)),
      );

      const first = await useCase.execute(validInput({ name: { fr: 'Sara', ar: 'سارة' } }));
      await students.softDelete(first.id, new Date('2026-07-30T00:00:00Z'));

      await expect(
        useCase.execute(validInput({ name: { fr: 'Omar', ar: 'عمر' } })),
      ).resolves.toBeDefined();
    });
  });

  describe('validation', () => {
    it('rejects a blank French name', async () => {
      await expect(
        useCase.execute(validInput({ name: { fr: '   ', ar: 'ياسين' } })),
      ).rejects.toThrow();
    });

    it('rejects an impossible birth date', async () => {
      await expect(useCase.execute(validInput({ birthDate: '2011-02-30' }))).rejects.toThrow();
    });

    it('rejects a missing level', async () => {
      await expect(useCase.execute(validInput({ level: '' }))).rejects.toThrow();
    });

    it('rejects a guardian id without the prt_ prefix', async () => {
      await expect(
        useCase.execute(validInput({ guardianIds: ['not-an-id'] })),
      ).rejects.toThrow();
    });

    it('persists nothing when validation fails', async () => {
      await expect(useCase.execute(validInput({ birthDate: 'nope' }))).rejects.toThrow();
      expect(students.all()).toHaveLength(0);
    });
  });
});
