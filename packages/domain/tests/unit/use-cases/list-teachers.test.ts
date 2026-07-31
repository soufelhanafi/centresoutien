import { describe, it, expect, beforeEach } from 'vitest';
import { CreateTeacher } from '../../../src/use-cases/create-teacher';
import { ListTeachers } from '../../../src/use-cases/list-teachers';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryTeacherRepository } from '../fakes/in-memory-teacher-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

describe('ListTeachers', () => {
  let teachers: InMemoryTeacherRepository;
  let create: CreateTeacher;
  let useCase: ListTeachers;

  beforeEach(() => {
    teachers = new InMemoryTeacherRepository();
    create = new CreateTeacher(teachers, fakeClock(), fakeIds(), new PlanPolicy(PLANS.pro));
    useCase = new ListTeachers(teachers, new PlanPolicy(PLANS.pro));
  });

  async function add(name: { fr: string; ar: string }, phone: string, centerCode = CENTER) {
    return create.execute({
      name,
      cin: null,
      phone,
      email: null,
      subjectIds: [],
      centerCode,
      deviceOrigin: DEVICE,
      updatedBy: USER,
    });
  }

  it('returns all live teachers of the center, ordered by French name, on an empty search', async () => {
    await add({ fr: 'Zaid', ar: 'زيد' }, '0611111111');
    await add({ fr: 'amine', ar: 'أمين' }, '0622222222');
    await add({ fr: 'Bilal', ar: 'بلال' }, '0633333333', OTHER); // other tenant

    const rows = await useCase.execute({ centerCode: CENTER, search: '' });
    expect(rows.map((t) => t.name.fr)).toEqual(['amine', 'Zaid']);
  });

  it('excludes archived teachers', async () => {
    const gone = await add({ fr: 'Farès', ar: 'فارس' }, '0644444444');
    await teachers.softDelete(gone.id, new Date('2026-08-01T00:00:00Z'), USER);
    await add({ fr: 'Nadia', ar: 'نادية' }, '0655555555');

    const rows = await useCase.execute({ centerCode: CENTER, search: '' });
    expect(rows.map((t) => t.name.fr)).toEqual(['Nadia']);
  });

  it('matches accent-insensitively on the FR name', async () => {
    await add({ fr: 'Farès', ar: 'فارس' }, '0644444444');
    const rows = await useCase.execute({ centerCode: CENTER, search: 'fares' });
    expect(rows).toHaveLength(1);
  });

  it('matches on the AR name', async () => {
    await add({ fr: 'Nadia', ar: 'نادية' }, '0655555555');
    const rows = await useCase.execute({ centerCode: CENTER, search: 'نادية' });
    expect(rows).toHaveLength(1);
  });

  it('matches the national 0-prefixed phone form against the stored E.164 number', async () => {
    await add({ fr: 'Yassine', ar: 'ياسين' }, '0612345678');
    const rows = await useCase.execute({ centerCode: CENTER, search: '0612' });
    expect(rows).toHaveLength(1);
  });

  it('returns nothing when a text-only search matches neither name nor phone', async () => {
    await add({ fr: 'Yassine', ar: 'ياسين' }, '0612345678');
    // A non-digit needle whose digits fold to '' → the phone branch bails out and
    // the name branches miss, so no teacher matches.
    const rows = await useCase.execute({ centerCode: CENTER, search: 'zzz' });
    expect(rows).toEqual([]);
  });

  it('throws PlanFeatureUnavailableError when the plan lacks core.teachers', async () => {
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(['core.students']),
      limits: PLANS.essentiel.limits,
    };
    useCase = new ListTeachers(teachers, new PlanPolicy(planWithout));
    await expect(useCase.execute({ centerCode: CENTER, search: '' })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
