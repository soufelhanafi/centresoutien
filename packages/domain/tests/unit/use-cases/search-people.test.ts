import { describe, it, expect, beforeEach } from 'vitest';
import { SearchPeople } from '../../../src/use-cases/search-people';
import { ListStudents } from '../../../src/use-cases/list-students';
import { ListTeachers } from '../../../src/use-cases/list-teachers';
import { ListParents } from '../../../src/use-cases/list-parents';
import { CreateStudent, type CreateStudentInput } from '../../../src/use-cases/create-student';
import { CreateTeacher, type CreateTeacherInput } from '../../../src/use-cases/create-teacher';
import { CreateParent, type CreateParentInput } from '../../../src/use-cases/create-parent';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryStudentRepository } from '../fakes/in-memory-student-repository';
import { InMemoryTeacherRepository } from '../fakes/in-memory-teacher-repository';
import { InMemoryParentRepository } from '../fakes/in-memory-parent-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

function studentInput(overrides: Partial<CreateStudentInput> = {}): CreateStudentInput {
  return {
    name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    birthDate: '2010-01-01',
    level: 'Test Level',
    school: null,
    notes: null,
    guardianIds: [],
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

function teacherInput(overrides: Partial<CreateTeacherInput> = {}): CreateTeacherInput {
  return {
    name: { fr: 'Yasser Bennani', ar: 'ياسر البناني' },
    cin: null,
    phone: '0699999999',
    email: null,
    subjectIds: [],
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

function parentInput(overrides: Partial<CreateParentInput> = {}): CreateParentInput {
  return {
    name: 'Yasmina Cherkaoui',
    phone: '0611111111',
    email: null,
    relation: 'mere',
    whatsappOptIn: false,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

function planWithout(...missing: FeatureFlag[]): Plan {
  const features = new Set(PLANS.essentiel.features);
  for (const feature of missing) features.delete(feature);
  return { id: 'essentiel', features, limits: PLANS.essentiel.limits };
}

describe('SearchPeople', () => {
  let students: InMemoryStudentRepository;
  let teachers: InMemoryTeacherRepository;
  let parents: InMemoryParentRepository;
  let createStudent: CreateStudent;
  let createTeacher: CreateTeacher;
  let createParent: CreateParent;

  function buildSearch(plan: Plan): SearchPeople {
    const policy = new PlanPolicy(plan);
    return new SearchPeople(
      new ListStudents(students, policy),
      new ListTeachers(teachers, policy),
      new ListParents(parents, policy),
    );
  }

  beforeEach(() => {
    students = new InMemoryStudentRepository();
    teachers = new InMemoryTeacherRepository();
    parents = new InMemoryParentRepository();
    const plan = new PlanPolicy(PLANS.essentiel);
    createStudent = new CreateStudent(students, fakeClock(), fakeIds(), plan);
    createTeacher = new CreateTeacher(teachers, fakeClock(), fakeIds(), plan);
    createParent = new CreateParent(parents, fakeClock(), fakeIds(), plan);
  });

  it('returns name matches across student, teacher, and parent kinds, tagged with their kind', async () => {
    await createStudent.execute(studentInput());
    await createTeacher.execute(teacherInput());
    await createParent.execute(parentInput());

    const search = buildSearch(PLANS.essentiel);
    const results = await search.execute({ centerCode: CENTER, query: 'yas' });

    expect(results.map((r) => r.kind).sort()).toEqual(['parent', 'student', 'teacher']);
  });

  it('matches the Arabic name too', async () => {
    await createStudent.execute(studentInput());
    const search = buildSearch(PLANS.essentiel);
    const results = await search.execute({ centerCode: CENTER, query: 'ياسين' });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ kind: 'student' });
  });

  it('matches by name only — a level or phone substring never matches', async () => {
    await createStudent.execute(studentInput());
    await createParent.execute(parentInput());
    const search = buildSearch(PLANS.essentiel);

    expect(await search.execute({ centerCode: CENTER, query: 'Test Level' })).toEqual([]);
    expect(await search.execute({ centerCode: CENTER, query: '0611111111' })).toEqual([]);
  });

  it('returns no results for an empty query', async () => {
    await createStudent.execute(studentInput());
    const search = buildSearch(PLANS.essentiel);
    expect(await search.execute({ centerCode: CENTER, query: '' })).toEqual([]);
    expect(await search.execute({ centerCode: CENTER, query: '   ' })).toEqual([]);
  });

  it('caps results to 20, sorted alphabetically', async () => {
    for (let i = 0; i < 25; i += 1) {
      const suffix = String(i).padStart(2, '0');
      await createStudent.execute(
        studentInput({ name: { fr: `Test${suffix}`, ar: `اختبار${suffix}` } }),
      );
    }

    const search = buildSearch(PLANS.essentiel);
    const results = await search.execute({ centerCode: CENTER, query: 'test' });

    expect(results).toHaveLength(20);
    expect(results.map((r) => (r.kind === 'student' ? r.entity.name.fr : ''))).toEqual([
      'Test00',
      'Test01',
      'Test02',
      'Test03',
      'Test04',
      'Test05',
      'Test06',
      'Test07',
      'Test08',
      'Test09',
      'Test10',
      'Test11',
      'Test12',
      'Test13',
      'Test14',
      'Test15',
      'Test16',
      'Test17',
      'Test18',
      'Test19',
    ]);
  });

  it('still returns the other kinds when one entity kind is gated off by the plan', async () => {
    await createStudent.execute(studentInput());
    await createTeacher.execute(teacherInput());
    await createParent.execute(parentInput());

    const search = buildSearch(planWithout('core.teachers'));
    const results = await search.execute({ centerCode: CENTER, query: 'yas' });

    expect(results.map((r) => r.kind).sort()).toEqual(['parent', 'student']);
  });
});
