import { describe, it, expect, beforeEach } from 'vitest';
import { ListStudents } from '../../../src/use-cases/list-students';
import { CreateStudent, type CreateStudentInput } from '../../../src/use-cases/create-student';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryStudentRepository } from '../fakes/in-memory-student-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

function input(
  name: { fr: string; ar: string },
  level: string,
  centerCode: CenterCode = CENTER,
): CreateStudentInput {
  return {
    name,
    birthDate: '2010-01-01',
    level,
    school: null,
    notes: null,
    guardianIds: [],
    centerCode,
    deviceOrigin: DEVICE,
    updatedBy: USER,
  };
}

/** A plan stripped of `core.students`, to prove the gate fires. */
function planWithoutStudents(): Plan {
  return { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };
}

describe('ListStudents', () => {
  let students: InMemoryStudentRepository;
  let create: CreateStudent;
  let list: ListStudents;

  beforeEach(async () => {
    students = new InMemoryStudentRepository();
    const plan = new PlanPolicy(PLANS.essentiel);
    create = new CreateStudent(students, fakeClock(), fakeIds(), plan);
    list = new ListStudents(students, plan);

    await create.execute(input({ fr: 'Yassine Alaoui', ar: 'ياسين العلوي' }, '2 Bac SM'));
    await create.execute(input({ fr: 'Salma Bennani', ar: 'سلمى البناني' }, '3AC'));
    await create.execute(input({ fr: 'Adam Cherkaoui', ar: 'آدم الشرقاوي' }, '1 Bac SE'));
    // A student in another center must never leak into this center's list.
    await create.execute(input({ fr: 'Autre Centre', ar: 'مركز آخر' }, '3AC', OTHER_CENTER));
  });

  it('returns the center\'s live students, alphabetical by French name', async () => {
    const result = await list.execute({ centerCode: CENTER, search: '' });
    expect(result.map((s) => s.name.fr)).toEqual(['Adam Cherkaoui', 'Salma Bennani', 'Yassine Alaoui']);
  });

  it('scopes to the center — never leaks another tenant', async () => {
    const result = await list.execute({ centerCode: CENTER, search: '' });
    expect(result.some((s) => s.centerCode === OTHER_CENTER)).toBe(false);
  });

  it('filters by name, accent- and case-insensitive', async () => {
    const result = await list.execute({ centerCode: CENTER, search: 'salma' });
    expect(result.map((s) => s.name.fr)).toEqual(['Salma Bennani']);
  });

  it('matches on the Arabic name too', async () => {
    const result = await list.execute({ centerCode: CENTER, search: 'آدم' });
    expect(result.map((s) => s.name.fr)).toEqual(['Adam Cherkaoui']);
  });

  it('filters by level', async () => {
    const result = await list.execute({ centerCode: CENTER, search: '3AC' });
    expect(result.map((s) => s.name.fr)).toEqual(['Salma Bennani']);
  });

  it('returns an empty list when nothing matches', async () => {
    expect(await list.execute({ centerCode: CENTER, search: 'zzz' })).toEqual([]);
  });

  it('is gated by core.students', async () => {
    const locked = new ListStudents(students, new PlanPolicy(planWithoutStudents()));
    await expect(locked.execute({ centerCode: CENTER, search: '' })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
