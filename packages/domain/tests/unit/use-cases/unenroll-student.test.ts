import { describe, it, expect, beforeEach } from 'vitest';
import { UnenrollStudent } from '../../../src/use-cases/unenroll-student';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { EnrollmentNotFoundError } from '../../../src/errors/enrollment-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { Enrollment, EnrollmentId } from '../../../src/entities/enrollment';
import type { StudentId } from '../../../src/entities/student';
import type { GroupId } from '../../../src/entities/group';
import { InMemoryEnrollmentRepository } from '../fakes/in-memory-enrollment-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const ENROLLMENT_ID = 'enr_00000000000000000000000001' as EnrollmentId;
const STUDENT_ID = 'stu_00000000000000000000000002' as StudentId;
const GROUP_ID = 'grp_00000000000000000000000003' as GroupId;

function seededEnrollment(createdAt: string): Enrollment {
  return {
    id: ENROLLMENT_ID,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock(createdAt)),
    studentId: STUDENT_ID,
    groupId: GROUP_ID,
    startMonth: '2026-09',
    endMonth: null,
  };
}

describe('UnenrollStudent', () => {
  let enrollments: InMemoryEnrollmentRepository;

  beforeEach(async () => {
    enrollments = new InMemoryEnrollmentRepository();
    await enrollments.save(seededEnrollment('2026-07-29T10:00:00Z'));
  });

  describe('happy path', () => {
    it('soft-deletes the enrollment and frees the seat', async () => {
      const useCase = new UnenrollStudent(
        enrollments,
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );

      await useCase.execute({ centerCode: CENTER, enrollmentId: ENROLLMENT_ID, updatedBy: USER });

      expect(await enrollments.findById(ENROLLMENT_ID)).toBeNull();
      expect(await enrollments.countActiveByGroup(GROUP_ID)).toBe(0);
    });

    it('leaves a tombstone (deletedAt + who) visible to listChangedSince for sync', async () => {
      const useCase = new UnenrollStudent(
        enrollments,
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );

      await useCase.execute({ centerCode: CENTER, enrollmentId: ENROLLMENT_ID, updatedBy: USER });

      const changed = await enrollments.listChangedSince(new Date('2026-07-30T00:00:00Z'));
      expect(changed).toHaveLength(1);
      expect(changed[0]?.id).toBe(ENROLLMENT_ID);
      expect(changed[0]?.deletedAt).toEqual(new Date('2026-07-30T09:00:00Z'));
      expect(changed[0]?.updatedBy).toBe(USER);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.groups', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      const useCase = new UnenrollStudent(
        enrollments,
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(planWithout),
      );

      await expect(
        useCase.execute({ centerCode: CENTER, enrollmentId: ENROLLMENT_ID, updatedBy: USER }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(await enrollments.findById(ENROLLMENT_ID)).not.toBeNull();
    });
  });

  describe('not found / tenant scoping', () => {
    it('throws EnrollmentNotFoundError for an unknown id and touches nothing', async () => {
      const useCase = new UnenrollStudent(
        enrollments,
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );
      const UNKNOWN = 'enr_00000000000000000000000099' as EnrollmentId;

      await expect(
        useCase.execute({ centerCode: CENTER, enrollmentId: UNKNOWN, updatedBy: USER }),
      ).rejects.toBeInstanceOf(EnrollmentNotFoundError);
      expect(await enrollments.findById(ENROLLMENT_ID)).not.toBeNull();
    });

    it('throws EnrollmentNotFoundError for an enrollment in another center (no cross-tenant)', async () => {
      const useCase = new UnenrollStudent(
        enrollments,
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );

      await expect(
        useCase.execute({ centerCode: OTHER_CENTER, enrollmentId: ENROLLMENT_ID, updatedBy: USER }),
      ).rejects.toBeInstanceOf(EnrollmentNotFoundError);
      expect(await enrollments.findById(ENROLLMENT_ID)).not.toBeNull();
    });

    it('throws EnrollmentNotFoundError for an already-unenrolled enrollment', async () => {
      await enrollments.softDelete(ENROLLMENT_ID, new Date('2026-07-30T08:00:00Z'), USER);
      const useCase = new UnenrollStudent(
        enrollments,
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );

      await expect(
        useCase.execute({ centerCode: CENTER, enrollmentId: ENROLLMENT_ID, updatedBy: USER }),
      ).rejects.toBeInstanceOf(EnrollmentNotFoundError);
    });
  });
});
