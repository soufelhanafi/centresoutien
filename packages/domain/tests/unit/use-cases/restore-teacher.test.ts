import { describe, it, expect, beforeEach } from 'vitest';
import { RestoreTeacher } from '../../../src/use-cases/restore-teacher';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError, PlanLimitExceededError } from '../../../src/errors/plan-errors';
import { DuplicateTeacherError, TeacherNotFoundError } from '../../../src/errors/people-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Teacher, TeacherId } from '../../../src/entities/teacher';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { PhoneNumber } from '../../../src/value-objects/phone-number';
import { InMemoryTeacherRepository } from '../fakes/in-memory-teacher-repository';
import { fakeClock } from '../fakes/clock';
import { planWithLimits } from '../fakes/plans';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const RESTORER = 'usr_00000000000000000000000002' as UserId;
const TEACHER_ID = 'tch_00000000000000000000000001' as TeacherId;

function seededTeacher(
  overrides: { id?: TeacherId; centerCode?: CenterCode; naturalKey?: string } = {},
): Teacher {
  const id = overrides.id ?? TEACHER_ID;
  const centerCode = overrides.centerCode ?? CENTER;
  return {
    id,
    ...newEnvelope({ centerCode, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock('2026-07-29T10:00:00Z')),
    naturalKey: overrides.naturalKey ?? `${centerCode}::yassine-alaoui::+212612345678`,
    name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    cin: null,
    phone: '+212612345678' as PhoneNumber,
    email: null,
    subjectIds: [],
    active: true,
  };
}

describe('RestoreTeacher', () => {
  let teachers: InMemoryTeacherRepository;
  let useCase: RestoreTeacher;

  beforeEach(async () => {
    teachers = new InMemoryTeacherRepository();
    await teachers.save(seededTeacher());
    await teachers.softDelete(TEACHER_ID, new Date('2026-07-30T00:00:00Z'), USER);
    useCase = new RestoreTeacher(teachers, fakeClock('2026-07-31T09:00:00Z'), new PlanPolicy(PLANS.essentiel));
  });

  describe('happy path', () => {
    it('clears the tombstone and bumps updatedAt/updatedBy so the teacher is live again', async () => {
      const restored = await useCase.execute({ centerCode: CENTER, id: TEACHER_ID, updatedBy: RESTORER });

      expect(restored.deletedAt).toBeNull();
      expect(restored.updatedAt).toEqual(new Date('2026-07-31T09:00:00Z'));
      expect(restored.updatedBy).toBe(RESTORER);
      // Identity + provenance + naturalKey + version preserved.
      expect(restored.id).toBe(TEACHER_ID);
      expect(restored.createdAt).toEqual(new Date('2026-07-29T10:00:00Z'));
      expect(restored.naturalKey).toBe(`${CENTER}::yassine-alaoui::+212612345678`);
      expect(restored.version).toBe(0);
      // Now readable through the live path and gone from the archive.
      expect(await teachers.findById(TEACHER_ID)).toEqual(restored);
      expect(await teachers.findArchivedById(TEACHER_ID)).toBeNull();
    });
  });

  describe('not found', () => {
    it('throws TeacherNotFoundError for a teacher that is already live (nothing to restore)', async () => {
      await useCase.execute({ centerCode: CENTER, id: TEACHER_ID, updatedBy: RESTORER });
      await expect(
        useCase.execute({ centerCode: CENTER, id: TEACHER_ID, updatedBy: RESTORER }),
      ).rejects.toBeInstanceOf(TeacherNotFoundError);
    });

    it('throws TeacherNotFoundError for an unknown id', async () => {
      await expect(
        useCase.execute({
          centerCode: CENTER,
          id: 'tch_00000000000000000000000099' as TeacherId,
          updatedBy: RESTORER,
        }),
      ).rejects.toBeInstanceOf(TeacherNotFoundError);
    });

    it('treats an archived teacher in another center as not found (tenant scoping)', async () => {
      await expect(
        useCase.execute({ centerCode: OTHER_CENTER, id: TEACHER_ID, updatedBy: RESTORER }),
      ).rejects.toBeInstanceOf(TeacherNotFoundError);
      // Still archived in its real center.
      expect(await teachers.findById(TEACHER_ID)).toBeNull();
      expect(await teachers.findArchivedById(TEACHER_ID)).not.toBeNull();
    });
  });

  describe('maxTeachers limit', () => {
    it('rejects a restore that would exceed the plan cap (cap: 2 live teachers)', async () => {
      // Fill both slots with distinct live teachers, then try to restore the
      // archived one — that would make 3 live teachers on a 2-teacher plan.
      useCase = new RestoreTeacher(
        teachers,
        fakeClock('2026-07-31T09:00:00Z'),
        new PlanPolicy(planWithLimits({ maxTeachers: 2 })),
      );
      await teachers.save(
        seededTeacher({
          id: 'tch_00000000000000000000000002' as TeacherId,
          naturalKey: `${CENTER}::karim-idrissi::+212611111111`,
        }),
      );
      await teachers.save(
        seededTeacher({
          id: 'tch_00000000000000000000000003' as TeacherId,
          naturalKey: `${CENTER}::sara-bennani::+212622222222`,
        }),
      );

      await expect(
        useCase.execute({ centerCode: CENTER, id: TEACHER_ID, updatedBy: RESTORER }),
      ).rejects.toBeInstanceOf(PlanLimitExceededError);
      // The archived teacher is untouched — still a tombstone.
      expect(await teachers.findArchivedById(TEACHER_ID)).not.toBeNull();
    });
  });

  describe('duplicate natural key', () => {
    it('rejects when a live teacher already holds the archived one’s natural key', async () => {
      // A namesake was created (same center + name + phone) while this teacher was
      // archived. Reviving would collide on the partial-unique index, so reject
      // with a typed error instead of leaking a DB constraint. Pro plan keeps the
      // maxTeachers cap out of the way so the duplicate guard is what fires.
      const pro = new RestoreTeacher(teachers, fakeClock('2026-07-31T09:00:00Z'), new PlanPolicy(PLANS.pro));
      await teachers.save(
        seededTeacher({ id: 'tch_00000000000000000000000009' as TeacherId }), // same default naturalKey
      );

      await expect(
        pro.execute({ centerCode: CENTER, id: TEACHER_ID, updatedBy: RESTORER }),
      ).rejects.toBeInstanceOf(DuplicateTeacherError);
      expect(await teachers.findArchivedById(TEACHER_ID)).not.toBeNull();
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.teachers', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(['core.students']),
        limits: PLANS.essentiel.limits,
      };
      useCase = new RestoreTeacher(teachers, fakeClock(), new PlanPolicy(planWithout));
      await expect(
        useCase.execute({ centerCode: CENTER, id: TEACHER_ID, updatedBy: RESTORER }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });
  });
});
