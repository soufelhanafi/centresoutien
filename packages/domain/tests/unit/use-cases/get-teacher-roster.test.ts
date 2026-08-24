import { describe, it, expect, beforeEach } from 'vitest';
import { GetTeacherRoster } from '../../../src/use-cases/get-teacher-roster';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Enrollment, EnrollmentId } from '../../../src/entities/enrollment';
import type { Group, GroupId, GroupKind } from '../../../src/entities/group';
import type { Student, StudentId } from '../../../src/entities/student';
import type { Subject, SubjectId } from '../../../src/entities/subject';
import type { Teacher, TeacherId } from '../../../src/entities/teacher';
import type {
  StudentSubscription,
  StudentSubscriptionId,
} from '../../../src/entities/student-subscription';
import type { FormulaId } from '../../../src/entities/formula';
import type { PhoneNumber } from '../../../src/value-objects/phone-number';
import type { CenterCode, DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';
import { InMemoryEnrollmentRepository } from '../fakes/in-memory-enrollment-repository';
import { InMemoryGroupRepository } from '../fakes/in-memory-group-repository';
import { InMemoryStudentRepository } from '../fakes/in-memory-student-repository';
import { InMemorySubjectRepository } from '../fakes/in-memory-subject-repository';
import { InMemoryTeacherRepository } from '../fakes/in-memory-teacher-repository';
import { InMemoryStudentSubscriptionRepository } from '../fakes/in-memory-student-subscription-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const TEACHER = 'tch_00000000000000000000000001' as TeacherId;
const OTHER_TEACHER = 'tch_00000000000000000000000002' as TeacherId;
const MATH = 'sub_00000000000000000000000001' as SubjectId;
const PHYSIQUE = 'sub_00000000000000000000000002' as SubjectId;

const clock = fakeClock('2026-07-29T10:00:00Z');
const envelope = () => newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock);

let studentSeq = 0;
function makeStudent(overrides: Partial<Student> = {}): Student {
  studentSeq += 1;
  const suffix = String(studentSeq).padStart(26, '0');
  return {
    id: `stu_${suffix}` as StudentId,
    ...envelope(),
    naturalKey: `key-${suffix}`,
    name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    birthDate: '2010-05-01',
    level: '2ème Bac',
    school: null,
    notes: null,
    guardianIds: [],
    niveauId: null,
    ...overrides,
  };
}

let groupSeq = 0;
function makeGroup(overrides: Partial<Group> = {}): Group {
  groupSeq += 1;
  return {
    id: `grp_${String(groupSeq).padStart(26, '0')}` as GroupId,
    ...envelope(),
    subjectId: MATH,
    teacherId: TEACHER as string as EntityId,
    level: '2ème Bac',
    niveauId: null,
    capacity: 20,
    kind: 'regular' as GroupKind,
    active: true,
    ...overrides,
  };
}

let enrollmentSeq = 0;
function makeEnrollment(
  studentId: StudentId,
  groupId: GroupId,
  overrides: Partial<Enrollment> = {},
): Enrollment {
  enrollmentSeq += 1;
  return {
    id: `enr_${String(enrollmentSeq).padStart(26, '0')}` as EnrollmentId,
    ...envelope(),
    studentId,
    groupId,
    startMonth: '2026-09',
    endMonth: null,
    unenrolledUnderTeacherId: null,
    ...overrides,
  };
}

function makeSubject(id: SubjectId, name: { fr: string; ar: string }): Subject {
  return { id, ...envelope(), name, code: null, active: true };
}

function makeTeacher(overrides: Partial<Teacher> = {}): Teacher {
  return {
    id: TEACHER,
    ...envelope(),
    naturalKey: 'tkey-1',
    name: { fr: 'Prof Karim', ar: 'الأستاذ كريم' },
    cin: null,
    phone: '+212600000000' as PhoneNumber,
    email: null,
    subjectIds: [MATH],
    active: true,
    ...overrides,
  };
}

let subSeq = 0;
function makeSubscription(
  studentId: StudentId,
  subjectIds: readonly SubjectId[],
  overrides: Partial<StudentSubscription> = {},
): StudentSubscription {
  subSeq += 1;
  return {
    id: `sbs_${String(subSeq).padStart(26, '0')}` as StudentSubscriptionId,
    ...envelope(),
    studentId,
    formulaId: 'fml_00000000000000000000000001' as FormulaId,
    kind: 'regular',
    subjectIds,
    startMonth: '2026-09',
    endMonth: null,
    ...overrides,
  };
}

describe('GetTeacherRoster', () => {
  let teachers: InMemoryTeacherRepository;
  let groups: InMemoryGroupRepository;
  let enrollments: InMemoryEnrollmentRepository;
  let students: InMemoryStudentRepository;
  let subjects: InMemorySubjectRepository;
  let subscriptions: InMemoryStudentSubscriptionRepository;
  let useCase: GetTeacherRoster;

  // The roster's "active this month" filter reads the clock; seeded subscriptions
  // start 2026-09, so the use-case clock sits inside that range.
  const rosterClock = fakeClock('2026-09-15T10:00:00Z');

  function build(plan: Plan = PLANS.essentiel): GetTeacherRoster {
    return new GetTeacherRoster(
      teachers,
      groups,
      enrollments,
      students,
      subjects,
      subscriptions,
      rosterClock,
      new PlanPolicy(plan),
    );
  }

  beforeEach(async () => {
    teachers = new InMemoryTeacherRepository();
    groups = new InMemoryGroupRepository();
    enrollments = new InMemoryEnrollmentRepository();
    students = new InMemoryStudentRepository();
    subjects = new InMemorySubjectRepository();
    subscriptions = new InMemoryStudentSubscriptionRepository();
    await teachers.save(makeTeacher());
    await subjects.save(makeSubject(MATH, { fr: 'Mathématiques', ar: 'الرياضيات' }));
    await subjects.save(makeSubject(PHYSIQUE, { fr: 'Physique', ar: 'الفيزياء' }));
    useCase = build();
  });

  it('lists the teacher\'s distinct actively-enrolled students, sorted by French name', async () => {
    const mathGroup = makeGroup({ subjectId: MATH });
    await groups.save(mathGroup);
    const zineb = makeStudent({ name: { fr: 'Zineb Idrissi', ar: 'زينب الإدريسي' }, level: '1ère Bac' });
    const amine = makeStudent({ name: { fr: 'Amine Bennani', ar: 'أمين بناني' } });
    await students.save(zineb);
    await students.save(amine);
    await subscriptions.save(makeSubscription(zineb.id, [MATH]));
    await enrollments.save(makeEnrollment(zineb.id, mathGroup.id));
    await enrollments.save(makeEnrollment(amine.id, mathGroup.id));

    const roster = await useCase.execute({ centerCode: CENTER, teacherId: TEACHER });

    expect(roster.map((r) => r.name.fr)).toEqual(['Amine Bennani', 'Zineb Idrissi']);
    const zinebRow = roster.find((r) => r.studentId === zineb.id);
    expect(zinebRow).toMatchObject({
      level: '1ère Bac',
      status: 'active',
      leftMonth: null,
      formulaLabel: { fr: 'Mathématiques', ar: 'الرياضيات' },
      kinds: ['regular'],
    });
    expect(zinebRow?.groups).toHaveLength(1);
    expect(zinebRow?.subjects).toEqual([{ subjectId: MATH, name: { fr: 'Mathématiques', ar: 'الرياضيات' } }]);
  });

  it('folds a student enrolled in two of the teacher\'s groups into one row (no duplicate)', async () => {
    const mathGroup = makeGroup({ subjectId: MATH });
    const physicsGroup = makeGroup({ subjectId: PHYSIQUE, kind: 'exam-prep' });
    await groups.save(mathGroup);
    await groups.save(physicsGroup);
    const student = makeStudent();
    await students.save(student);
    await subscriptions.save(makeSubscription(student.id, [MATH, PHYSIQUE]));
    await enrollments.save(makeEnrollment(student.id, mathGroup.id));
    await enrollments.save(makeEnrollment(student.id, physicsGroup.id));

    const roster = await useCase.execute({ centerCode: CENTER, teacherId: TEACHER });

    expect(roster).toHaveLength(1);
    expect(roster[0]?.groups).toHaveLength(2);
    expect(roster[0]?.subjects.map((s) => s.subjectId).sort()).toEqual([MATH, PHYSIQUE].sort());
    expect([...(roster[0]?.kinds ?? [])].sort()).toEqual(['exam-prep', 'regular']);
    expect(roster[0]?.formulaLabel).toEqual({
      fr: 'Mathématiques + Physique',
      ar: 'الرياضيات + الفيزياء',
    });
  });

  it('returns an empty roster for a teacher with no groups', async () => {
    expect(await useCase.execute({ centerCode: CENTER, teacherId: TEACHER })).toEqual([]);
  });

  it('returns an empty roster for an unknown teacher', async () => {
    const orphanGroup = makeGroup({ teacherId: OTHER_TEACHER as string as EntityId });
    await groups.save(orphanGroup);
    expect(await useCase.execute({ centerCode: CENTER, teacherId: OTHER_TEACHER })).toEqual([]);
  });

  it('excludes groups belonging to another teacher', async () => {
    const mine = makeGroup({ subjectId: MATH });
    const theirs = makeGroup({ subjectId: MATH, teacherId: OTHER_TEACHER as string as EntityId });
    await groups.save(mine);
    await groups.save(theirs);
    const myStudent = makeStudent();
    const theirStudent = makeStudent();
    await students.save(myStudent);
    await students.save(theirStudent);
    await enrollments.save(makeEnrollment(myStudent.id, mine.id));
    await enrollments.save(makeEnrollment(theirStudent.id, theirs.id));

    const roster = await useCase.execute({ centerCode: CENTER, teacherId: TEACHER });
    expect(roster.map((r) => r.studentId)).toEqual([myStudent.id]);
  });

  it('marks a student who left one of the teacher\'s groups with the departure month', async () => {
    const mathGroup = makeGroup({ subjectId: MATH });
    await groups.save(mathGroup);
    const student = makeStudent({ name: { fr: 'Salma Tazi', ar: 'سلمى التازي' } });
    await students.save(student);
    const gone = makeEnrollment(student.id, mathGroup.id);
    await enrollments.save(gone);
    await enrollments.softDeleteUnderTeacher(
      gone.id,
      new Date('2026-09-15T00:00:00Z'),
      USER,
      TEACHER as string as EntityId,
    );

    const roster = await useCase.execute({ centerCode: CENTER, teacherId: TEACHER });
    expect(roster).toHaveLength(1);
    expect(roster[0]).toMatchObject({ status: 'left', leftMonth: '2026-09' });
  });

  it('never attributes a null-snapshot departure to any teacher, even after the group is staffed (SOU-301)', async () => {
    // Student left while the group was unstaffed → null snapshot. Assigning a
    // teacher afterwards must NOT put that leaver on the new teacher's roster.
    const unstaffed = makeGroup({ subjectId: MATH, teacherId: null });
    await groups.save(unstaffed);
    const student = makeStudent();
    await students.save(student);
    const gone = makeEnrollment(student.id, unstaffed.id);
    await enrollments.save(gone);
    await enrollments.softDeleteUnderTeacher(gone.id, new Date('2026-09-15T00:00:00Z'), USER, null);
    // Now staff the group with TEACHER.
    await groups.save({ ...unstaffed, teacherId: TEACHER as string as EntityId });

    expect(await useCase.execute({ centerCode: CENTER, teacherId: TEACHER })).toEqual([]);
  });

  it('keeps a student active when still enrolled elsewhere despite leaving one group', async () => {
    const groupA = makeGroup({ subjectId: MATH });
    const groupB = makeGroup({ subjectId: PHYSIQUE });
    await groups.save(groupA);
    await groups.save(groupB);
    const student = makeStudent();
    await students.save(student);
    const left = makeEnrollment(student.id, groupA.id);
    await enrollments.save(left);
    await enrollments.softDelete(left.id, new Date('2026-09-10T00:00:00Z'), USER);
    await enrollments.save(makeEnrollment(student.id, groupB.id));

    const roster = await useCase.execute({ centerCode: CENTER, teacherId: TEACHER });
    expect(roster).toHaveLength(1);
    expect(roster[0]).toMatchObject({ status: 'active', leftMonth: null });
    expect(roster[0]?.groups.map((g) => g.groupId)).toEqual([groupB.id]);
  });

  it('keeps a departed student on the former teacher\'s roster after the group is reassigned A→B (SOU-301)', async () => {
    // A's only group, reassigned to B after the student left under A.
    const group = makeGroup({ subjectId: MATH, teacherId: TEACHER as string as EntityId });
    await groups.save(group);
    await teachers.save(makeTeacher({ id: OTHER_TEACHER, naturalKey: 'tkey-2' }));
    const student = makeStudent({ name: { fr: 'Salma Tazi', ar: 'سلمى التازي' } });
    await students.save(student);

    const gone = makeEnrollment(student.id, group.id);
    await enrollments.save(gone);
    // Snapshot the teacher A held the group at unenroll time (what UnenrollStudent does).
    await enrollments.softDeleteUnderTeacher(
      gone.id,
      new Date('2026-09-15T00:00:00Z'),
      USER,
      TEACHER as string as EntityId,
    );
    // Now reassign the group to B.
    await groups.save({ ...group, teacherId: OTHER_TEACHER as string as EntityId });

    const rosterA = await useCase.execute({ centerCode: CENTER, teacherId: TEACHER });
    expect(rosterA.map((r) => r.studentId)).toEqual([student.id]);
    expect(rosterA[0]).toMatchObject({ status: 'left', leftMonth: '2026-09' });
    expect(rosterA[0]?.groups.map((g) => g.groupId)).toEqual([group.id]);

    const rosterB = await useCase.execute({ centerCode: CENTER, teacherId: OTHER_TEACHER });
    expect(rosterB).toEqual([]);
  });

  it('attributes a snapshotted departure in the teacher\'s current group without double-counting', async () => {
    const group = makeGroup({ subjectId: MATH, teacherId: TEACHER as string as EntityId });
    await groups.save(group);
    const student = makeStudent({ name: { fr: 'Salma Tazi', ar: 'سلمى التازي' } });
    await students.save(student);
    const gone = makeEnrollment(student.id, group.id);
    await enrollments.save(gone);
    await enrollments.softDeleteUnderTeacher(
      gone.id,
      new Date('2026-09-15T00:00:00Z'),
      USER,
      TEACHER as string as EntityId,
    );

    const roster = await useCase.execute({ centerCode: CENTER, teacherId: TEACHER });
    expect(roster).toHaveLength(1);
    expect(roster[0]).toMatchObject({ status: 'left', leftMonth: '2026-09' });
    expect(roster[0]?.groups.map((g) => g.groupId)).toEqual([group.id]);
  });

  it('drops a snapshotted departed row whose group was archived (SOU-301)', async () => {
    const group = makeGroup({ subjectId: MATH, teacherId: TEACHER as string as EntityId });
    await groups.save(group);
    const student = makeStudent();
    await students.save(student);
    const gone = makeEnrollment(student.id, group.id);
    await enrollments.save(gone);
    await enrollments.softDeleteUnderTeacher(
      gone.id,
      new Date('2026-09-15T00:00:00Z'),
      USER,
      TEACHER as string as EntityId,
    );
    await groups.softDelete(group.id, new Date('2026-09-16T00:00:00Z'), USER);

    expect(await useCase.execute({ centerCode: CENTER, teacherId: TEACHER })).toEqual([]);
  });

  it('composes the formula from only the subscription active this month, not a closed prior pack', async () => {
    const mathGroup = makeGroup({ subjectId: MATH });
    await groups.save(mathGroup);
    const student = makeStudent();
    await students.save(student);
    // Old pack (Math + Physique) closed in the past; new pack (Math only) live now.
    await subscriptions.save(
      makeSubscription(student.id, [MATH, PHYSIQUE], { startMonth: '2026-06', endMonth: '2026-08' }),
    );
    await subscriptions.save(makeSubscription(student.id, [MATH], { startMonth: '2026-09' }));
    await enrollments.save(makeEnrollment(student.id, mathGroup.id));

    const roster = await useCase.execute({ centerCode: CENTER, teacherId: TEACHER });
    expect(roster[0]?.formulaLabel).toEqual({ fr: 'Mathématiques', ar: 'الرياضيات' });
  });

  it('drops an enrollment whose own centerCode is foreign, even when student and group are local', async () => {
    const mathGroup = makeGroup({ subjectId: MATH });
    await groups.save(mathGroup);
    const localStudent = makeStudent();
    await students.save(localStudent);
    await enrollments.save(makeEnrollment(localStudent.id, mathGroup.id, { centerCode: OTHER_CENTER }));

    expect(await useCase.execute({ centerCode: CENTER, teacherId: TEACHER })).toEqual([]);
  });

  it('drops a foreign-center enrollment/student (defense in depth for the portable core)', async () => {
    const mathGroup = makeGroup({ subjectId: MATH });
    await groups.save(mathGroup);
    const foreign = makeStudent({ centerCode: OTHER_CENTER });
    await students.save(foreign);
    await enrollments.save(makeEnrollment(foreign.id, mathGroup.id));

    expect(await useCase.execute({ centerCode: CENTER, teacherId: TEACHER })).toEqual([]);
  });

  it('skips a seat whose student was archived without being unenrolled', async () => {
    const mathGroup = makeGroup({ subjectId: MATH });
    await groups.save(mathGroup);
    const archived = makeStudent();
    const present = makeStudent();
    await students.save(archived);
    await students.save(present);
    await students.softDelete(archived.id, new Date('2026-08-01T00:00:00Z'), USER);
    await enrollments.save(makeEnrollment(archived.id, mathGroup.id));
    await enrollments.save(makeEnrollment(present.id, mathGroup.id));

    const roster = await useCase.execute({ centerCode: CENTER, teacherId: TEACHER });
    expect(roster.map((r) => r.studentId)).toEqual([present.id]);
  });

  it('throws PlanFeatureUnavailableError when the plan lacks core.teachers', async () => {
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(),
      limits: PLANS.essentiel.limits,
    };
    useCase = build(planWithout);
    await expect(
      useCase.execute({ centerCode: CENTER, teacherId: TEACHER }),
    ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
  });
});
