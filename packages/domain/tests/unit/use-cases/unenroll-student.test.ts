import { describe, it, expect, beforeEach } from 'vitest';
import { UnenrollStudent } from '../../../src/use-cases/unenroll-student';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { EnrollmentNotFoundError } from '../../../src/errors/enrollment-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { CenterCode, DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';
import type { Enrollment, EnrollmentId } from '../../../src/entities/enrollment';
import type { StudentId } from '../../../src/entities/student';
import type { Group, GroupId } from '../../../src/entities/group';
import type { SubjectId } from '../../../src/entities/subject';
import { InMemoryEnrollmentRepository } from '../fakes/in-memory-enrollment-repository';
import { InMemoryGroupRepository } from '../fakes/in-memory-group-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const ENROLLMENT_ID = 'enr_00000000000000000000000001' as EnrollmentId;
const STUDENT_ID = 'stu_00000000000000000000000002' as StudentId;
const GROUP_ID = 'grp_00000000000000000000000003' as GroupId;
const TEACHER_ID = 'tch_00000000000000000000000004' as EntityId;

function seededEnrollment(createdAt: string): Enrollment {
  return {
    id: ENROLLMENT_ID,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock(createdAt)),
    studentId: STUDENT_ID,
    groupId: GROUP_ID,
    startMonth: '2026-09',
    endMonth: null,
    unenrolledUnderTeacherId: null,
  };
}

function seededGroup(teacherId: EntityId | null): Group {
  return {
    id: GROUP_ID,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock('2026-07-01T00:00:00Z')),
    subjectId: 'sub_00000000000000000000000005' as SubjectId,
    teacherId,
    level: '2ème Bac',
    niveauId: null,
    capacity: 20,
    kind: 'regular',
    active: true,
  };
}

describe('UnenrollStudent', () => {
  let enrollments: InMemoryEnrollmentRepository;
  let groups: InMemoryGroupRepository;

  beforeEach(async () => {
    enrollments = new InMemoryEnrollmentRepository();
    groups = new InMemoryGroupRepository();
    await enrollments.save(seededEnrollment('2026-07-29T10:00:00Z'));
    await groups.save(seededGroup(TEACHER_ID));
  });

  describe('happy path', () => {
    it('soft-deletes the enrollment and frees the seat', async () => {
      const useCase = new UnenrollStudent(
        enrollments,
        groups,
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
        groups,
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

    it("snapshots the group's current teacher onto the tombstone (SOU-301)", async () => {
      const useCase = new UnenrollStudent(
        enrollments,
        groups,
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );

      await useCase.execute({ centerCode: CENTER, enrollmentId: ENROLLMENT_ID, updatedBy: USER });

      const [tombstone] = await enrollments.listInactiveByFormerTeacher(TEACHER_ID);
      expect(tombstone?.id).toBe(ENROLLMENT_ID);
      expect(tombstone?.unenrolledUnderTeacherId).toBe(TEACHER_ID);
    });

    it('snapshots null when the group is unstaffed', async () => {
      await groups.save(seededGroup(null));
      const useCase = new UnenrollStudent(
        enrollments,
        groups,
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );

      await useCase.execute({ centerCode: CENTER, enrollmentId: ENROLLMENT_ID, updatedBy: USER });

      const changed = await enrollments.listChangedSince(new Date('2026-07-30T00:00:00Z'));
      expect(changed[0]?.deletedAt).not.toBeNull();
      expect(changed[0]?.unenrolledUnderTeacherId).toBeNull();
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
        groups,
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
        groups,
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
        groups,
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
        groups,
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );

      await expect(
        useCase.execute({ centerCode: CENTER, enrollmentId: ENROLLMENT_ID, updatedBy: USER }),
      ).rejects.toBeInstanceOf(EnrollmentNotFoundError);
    });
  });
});
