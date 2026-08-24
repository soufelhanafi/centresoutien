import { describe, it, expect, beforeEach } from 'vitest';
import { GetGroupRoster } from '../../../src/use-cases/get-group-roster';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Enrollment, EnrollmentId } from '../../../src/entities/enrollment';
import type { GroupId } from '../../../src/entities/group';
import type { Student, StudentId } from '../../../src/entities/student';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryEnrollmentRepository } from '../fakes/in-memory-enrollment-repository';
import { InMemoryStudentRepository } from '../fakes/in-memory-student-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const GROUP = 'grp_00000000000000000000000001' as GroupId;
const OTHER_GROUP = 'grp_00000000000000000000000002' as GroupId;

const envelopeClock = fakeClock('2026-07-29T10:00:00Z');

let studentSeq = 0;
function makeStudent(overrides: Partial<Student> = {}): Student {
  studentSeq += 1;
  const suffix = String(studentSeq).padStart(26, '0');
  return {
    id: `stu_${suffix}` as StudentId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    naturalKey: `key-${suffix}`,
    name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    birthDate: '2010-05-01',
    level: '2ème Bac',
    school: null,
    notes: null,
    guardianIds: [],
    ...overrides,
  };
}

let enrollmentSeq = 0;
function makeEnrollment(studentId: StudentId, overrides: Partial<Enrollment> = {}): Enrollment {
  enrollmentSeq += 1;
  return {
    id: `enr_${String(enrollmentSeq).padStart(26, '0')}` as EnrollmentId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    studentId,
    groupId: GROUP,
    startMonth: '2026-09',
    endMonth: null,
    unenrolledUnderTeacherId: null,
    ...overrides,
  };
}

describe('GetGroupRoster', () => {
  let enrollments: InMemoryEnrollmentRepository;
  let students: InMemoryStudentRepository;
  let useCase: GetGroupRoster;

  beforeEach(() => {
    enrollments = new InMemoryEnrollmentRepository();
    students = new InMemoryStudentRepository();
    useCase = new GetGroupRoster(enrollments, students, new PlanPolicy(PLANS.essentiel));
  });

  it('resolves the group\'s live enrollments to named entries, sorted by French name', async () => {
    const zineb = makeStudent({ name: { fr: 'Zineb Idrissi', ar: 'زينب الإدريسي' }, level: '1ère Bac' });
    const amine = makeStudent({ name: { fr: 'Amine Bennani', ar: 'أمين بناني' }, level: '2ème Bac' });
    await students.save(zineb);
    await students.save(amine);
    const enrZineb = makeEnrollment(zineb.id, { startMonth: '2026-09' });
    await enrollments.save(enrZineb);
    await enrollments.save(makeEnrollment(amine.id, { startMonth: '2026-10' }));

    const roster = await useCase.execute({ centerCode: CENTER, groupId: GROUP });

    expect(roster.map((r) => r.name.fr)).toEqual(['Amine Bennani', 'Zineb Idrissi']);
    const zinebEntry = roster.find((r) => r.studentId === zineb.id);
    expect(zinebEntry).toMatchObject({
      enrollmentId: enrZineb.id,
      studentId: zineb.id,
      name: { fr: 'Zineb Idrissi', ar: 'زينب الإدريسي' },
      level: '1ère Bac',
      startMonth: '2026-09',
    });
  });

  it('returns an empty roster when the group has no enrollments', async () => {
    expect(await useCase.execute({ centerCode: CENTER, groupId: GROUP })).toEqual([]);
  });

  it('excludes an unenrolled (soft-deleted) enrollment row', async () => {
    const student = makeStudent();
    await students.save(student);
    const gone = makeEnrollment(student.id);
    await enrollments.save(gone);
    await enrollments.softDelete(gone.id, new Date('2026-08-01T00:00:00Z'), USER);

    expect(await useCase.execute({ centerCode: CENTER, groupId: GROUP })).toEqual([]);
  });

  it('excludes enrollments of another group', async () => {
    const student = makeStudent();
    await students.save(student);
    await enrollments.save(makeEnrollment(student.id, { groupId: OTHER_GROUP }));

    expect(await useCase.execute({ centerCode: CENTER, groupId: GROUP })).toEqual([]);
  });

  it('drops a foreign-center enrollment (defense in depth for the portable core)', async () => {
    const student = makeStudent();
    await students.save(student);
    await enrollments.save(makeEnrollment(student.id, { centerCode: OTHER_CENTER }));

    expect(await useCase.execute({ centerCode: CENTER, groupId: GROUP })).toEqual([]);
  });

  it('skips a seat whose student cannot be resolved to a live record (archived without unenroll)', async () => {
    const archived = makeStudent();
    await students.save(archived);
    await students.softDelete(archived.id, new Date('2026-08-01T00:00:00Z'), USER);
    const present = makeStudent();
    await students.save(present);
    await enrollments.save(makeEnrollment(archived.id));
    await enrollments.save(makeEnrollment(present.id));

    const roster = await useCase.execute({ centerCode: CENTER, groupId: GROUP });
    expect(roster.map((r) => r.studentId)).toEqual([present.id]);
  });

  it('drops a student who belongs to another center', async () => {
    const foreign = makeStudent({ centerCode: OTHER_CENTER });
    await students.save(foreign);
    await enrollments.save(makeEnrollment(foreign.id));

    expect(await useCase.execute({ centerCode: CENTER, groupId: GROUP })).toEqual([]);
  });

  it('throws PlanFeatureUnavailableError when the plan lacks core.groups', async () => {
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(),
      limits: PLANS.essentiel.limits,
    };
    useCase = new GetGroupRoster(enrollments, students, new PlanPolicy(planWithout));
    await expect(useCase.execute({ centerCode: CENTER, groupId: GROUP })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
