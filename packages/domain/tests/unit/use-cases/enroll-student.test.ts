import { describe, it, expect, beforeEach } from 'vitest';
import { EnrollStudent, type EnrollStudentInput } from '../../../src/use-cases/enroll-student';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { StudentNotFoundError } from '../../../src/errors/student-errors';
import { GroupNotFoundError } from '../../../src/errors/group-errors';
import {
  CrossKindEnrollmentError,
  EnrollmentSubscriptionMissingError,
  GroupFullError,
} from '../../../src/errors/enrollment-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { Group, GroupId } from '../../../src/entities/group';
import type { Student, StudentId } from '../../../src/entities/student';
import type { SubjectId } from '../../../src/entities/subject';
import type { RoomId } from '../../../src/entities/room';
import type { IdGenerator } from '../../../src/ports/id-generator';
import { InMemoryEnrollmentRepository } from '../fakes/in-memory-enrollment-repository';
import { InMemoryGroupRepository } from '../fakes/in-memory-group-repository';
import { InMemoryStudentRepository } from '../fakes/in-memory-student-repository';
import {
  fakeStudentSubscriptionReference,
  type SubscriptionCoverageEntry,
} from '../fakes/fake-student-subscription-reference';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const STUDENT_ID = 'stu_00000000000000000000000001' as StudentId;
const GROUP_ID = 'grp_00000000000000000000000002' as GroupId;
const SUBJECT_ID = 'sub_00000000000000000000000003' as SubjectId;
const ROOM_ID = 'rom_00000000000000000000000004' as RoomId;

const envelopeClock = fakeClock('2026-01-01T00:00:00Z');

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: GROUP_ID,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    subjectId: SUBJECT_ID,
    teacherId: null,
    roomId: ROOM_ID,
    level: '2 Bac SM',
    capacity: 2,
    kind: 'regular',
    active: true,
    ...overrides,
  };
}

function makeStudent(overrides: Partial<Student> = {}): Student {
  return {
    id: STUDENT_ID,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    naturalKey: `${CENTER}::yassine-alaoui::2009-05-01`,
    name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    birthDate: '2009-05-01',
    level: '2 Bac SM',
    school: null,
    notes: null,
    guardianIds: [],
    ...overrides,
  };
}

const regularCoverage: SubscriptionCoverageEntry = {
  studentId: STUDENT_ID,
  subjectId: SUBJECT_ID,
  kind: 'regular',
};

function validInput(overrides: Partial<EnrollStudentInput> = {}): EnrollStudentInput {
  return {
    studentId: STUDENT_ID,
    groupId: GROUP_ID,
    startMonth: '2026-09',
    endMonth: null,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

describe('EnrollStudent', () => {
  let enrollments: InMemoryEnrollmentRepository;
  let groups: InMemoryGroupRepository;
  let students: InMemoryStudentRepository;
  // Shared across every build() in a test so successive enrollments get distinct
  // ids (enr_…01, enr_…02) instead of colliding in the repo Map.
  let ids: IdGenerator;

  function build(
    plan: Plan,
    coverages: readonly SubscriptionCoverageEntry[] = [regularCoverage],
  ): EnrollStudent {
    return new EnrollStudent(
      enrollments,
      groups,
      students,
      fakeStudentSubscriptionReference(coverages),
      fakeClock('2026-07-31T10:00:00Z'),
      ids,
      new PlanPolicy(plan),
    );
  }

  beforeEach(async () => {
    enrollments = new InMemoryEnrollmentRepository();
    groups = new InMemoryGroupRepository();
    students = new InMemoryStudentRepository();
    ids = fakeIds();
    await groups.save(makeGroup());
    await students.save(makeStudent());
  });

  describe('happy path', () => {
    it('enrolls a student with a prefixed id, the input months, and a fresh envelope', async () => {
      const enrollment = await build(PLANS.essentiel).execute(
        validInput({ startMonth: '2026-09', endMonth: '2027-06' }),
      );

      expect(enrollment.id).toMatch(/^enr_/);
      expect(enrollment.studentId).toBe(STUDENT_ID);
      expect(enrollment.groupId).toBe(GROUP_ID);
      expect(enrollment.startMonth).toBe('2026-09');
      expect(enrollment.endMonth).toBe('2027-06');
      expect(enrollment.centerCode).toBe(CENTER);
      expect(enrollment.deviceOrigin).toBe(DEVICE);
      expect(enrollment.updatedBy).toBe(USER);
      expect(enrollment.createdAt).toEqual(new Date('2026-07-31T10:00:00Z'));
      expect(enrollment.updatedAt).toEqual(enrollment.createdAt);
      expect(enrollment.deletedAt).toBeNull();
      expect(enrollment.version).toBe(0);
    });

    it('defaults endMonth to null (open-ended) and persists so it can be read back', async () => {
      const enrollment = await build(PLANS.essentiel).execute(validInput());
      expect(enrollment.endMonth).toBeNull();
      expect(await enrollments.findById(enrollment.id)).toEqual(enrollment);
    });

    it('counts the new seat against the group', async () => {
      await build(PLANS.essentiel).execute(validInput());
      expect(await enrollments.countActiveByGroup(GROUP_ID)).toBe(1);
    });

    it('enrolls into an exam-prep group when the subscription kind matches', async () => {
      await groups.save(makeGroup({ kind: 'exam-prep' }));
      const enrollment = await build(PLANS.essentiel, [
        { ...regularCoverage, kind: 'exam-prep' },
      ]).execute(validInput());
      expect(await enrollments.findById(enrollment.id)).not.toBeNull();
    });
  });

  describe('capacity guard (runtime seat-full)', () => {
    it('throws GroupFullError when live enrollments reach the group capacity', async () => {
      // Capacity is 2 — fill both seats with other students, then try a third.
      await build(PLANS.essentiel).execute(
        validInput({ studentId: STUDENT_ID }),
      );
      const secondStudent = 'stu_00000000000000000000000009' as StudentId;
      await students.save(makeStudent({ id: secondStudent, naturalKey: 'nk-2' }));
      await build(PLANS.essentiel, [
        regularCoverage,
        { studentId: secondStudent, subjectId: SUBJECT_ID, kind: 'regular' },
      ]).execute(validInput({ studentId: secondStudent }));

      const thirdStudent = 'stu_00000000000000000000000010' as StudentId;
      await students.save(makeStudent({ id: thirdStudent, naturalKey: 'nk-3' }));
      await expect(
        build(PLANS.essentiel, [
          { studentId: thirdStudent, subjectId: SUBJECT_ID, kind: 'regular' },
        ]).execute(validInput({ studentId: thirdStudent })),
      ).rejects.toBeInstanceOf(GroupFullError);
      expect(await enrollments.countActiveByGroup(GROUP_ID)).toBe(2);
    });

    it('frees a seat after unenroll so a new student fits (soft-deleted rows do not count)', async () => {
      await groups.save(makeGroup({ capacity: 1 }));
      const first = await build(PLANS.essentiel).execute(validInput());
      await enrollments.softDelete(first.id, new Date('2026-08-01T00:00:00Z'), USER);

      const other = 'stu_00000000000000000000000009' as StudentId;
      await students.save(makeStudent({ id: other, naturalKey: 'nk-2' }));
      const second = await build(PLANS.essentiel, [
        { studentId: other, subjectId: SUBJECT_ID, kind: 'regular' },
      ]).execute(validInput({ studentId: other }));
      expect(await enrollments.findById(second.id)).not.toBeNull();
    });
  });

  describe('cross-kind guard (exam-prep isolation)', () => {
    it('throws CrossKindEnrollmentError when the subscription kind differs from the group kind', async () => {
      await groups.save(makeGroup({ kind: 'exam-prep' }));
      // Student holds only a regular subscription → cannot join an exam-prep group.
      await expect(build(PLANS.essentiel, [regularCoverage]).execute(validInput())).rejects.toBeInstanceOf(
        CrossKindEnrollmentError,
      );
      expect(await enrollments.countActiveByGroup(GROUP_ID)).toBe(0);
    });
  });

  describe('subscription coverage guard', () => {
    it('throws EnrollmentSubscriptionMissingError when no active subscription covers the subject', async () => {
      await expect(build(PLANS.essentiel, []).execute(validInput())).rejects.toBeInstanceOf(
        EnrollmentSubscriptionMissingError,
      );
      expect(await enrollments.countActiveByGroup(GROUP_ID)).toBe(0);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.groups', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      await expect(build(planWithout).execute(validInput())).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
      expect(await enrollments.countActiveByGroup(GROUP_ID)).toBe(0);
    });
  });

  describe('group resolution / tenant scoping', () => {
    it('throws GroupNotFoundError for an unknown group', async () => {
      const input = validInput({ groupId: 'grp_00000000000000000000000099' as GroupId });
      await expect(build(PLANS.essentiel).execute(input)).rejects.toBeInstanceOf(GroupNotFoundError);
    });

    it('throws GroupNotFoundError for a group in another center (no cross-tenant enroll)', async () => {
      const otherGroup = 'grp_00000000000000000000000005' as GroupId;
      await groups.save(makeGroup({ id: otherGroup, centerCode: OTHER_CENTER }));
      await expect(
        build(PLANS.essentiel).execute(validInput({ groupId: otherGroup })),
      ).rejects.toBeInstanceOf(GroupNotFoundError);
    });

    it('throws GroupNotFoundError for an archived (tombstoned) group', async () => {
      await groups.softDelete(GROUP_ID, new Date('2026-07-30T00:00:00Z'), USER);
      await expect(build(PLANS.essentiel).execute(validInput())).rejects.toBeInstanceOf(
        GroupNotFoundError,
      );
    });
  });

  describe('student resolution / tenant scoping', () => {
    it('throws StudentNotFoundError for an unknown student', async () => {
      const input = validInput({ studentId: 'stu_00000000000000000000000099' as StudentId });
      await expect(build(PLANS.essentiel).execute(input)).rejects.toBeInstanceOf(
        StudentNotFoundError,
      );
    });

    it('throws StudentNotFoundError for a student in another center (no cross-tenant enroll)', async () => {
      const otherStudent = 'stu_00000000000000000000000006' as StudentId;
      await students.save(makeStudent({ id: otherStudent, centerCode: OTHER_CENTER, naturalKey: 'nk-x' }));
      await expect(
        build(PLANS.essentiel).execute(validInput({ studentId: otherStudent })),
      ).rejects.toBeInstanceOf(StudentNotFoundError);
    });
  });

  describe('validation', () => {
    it('rejects a malformed student id', async () => {
      await expect(
        build(PLANS.essentiel).execute(validInput({ studentId: 'not-an-id' as StudentId })),
      ).rejects.toThrow();
    });

    it('rejects a malformed group id', async () => {
      await expect(
        build(PLANS.essentiel).execute(validInput({ groupId: 'not-an-id' as GroupId })),
      ).rejects.toThrow();
    });

    it('rejects an invalid startMonth', async () => {
      await expect(
        build(PLANS.essentiel).execute(validInput({ startMonth: '2026-13' })),
      ).rejects.toThrow();
    });

    it('rejects an endMonth before startMonth', async () => {
      await expect(
        build(PLANS.essentiel).execute(validInput({ startMonth: '2026-09', endMonth: '2026-08' })),
      ).rejects.toThrow();
    });
  });
});
