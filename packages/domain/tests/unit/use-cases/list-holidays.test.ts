import { describe, it, expect, beforeEach } from 'vitest';
import { CreateHoliday } from '../../../src/use-cases/create-holiday';
import { ArchiveHoliday } from '../../../src/use-cases/archive-holiday';
import { ListHolidays } from '../../../src/use-cases/list-holidays';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { Holiday } from '../../../src/entities/holiday';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryHolidayRepository } from '../fakes/in-memory-holiday-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

describe('ListHolidays', () => {
  let holidays: InMemoryHolidayRepository;
  let create: CreateHoliday;
  let list: ListHolidays;
  const plan = new PlanPolicy(PLANS.essentiel);

  beforeEach(() => {
    holidays = new InMemoryHolidayRepository();
    create = new CreateHoliday(holidays, fakeClock(), fakeIds(), plan);
    list = new ListHolidays(holidays, plan);
  });

  function seed(overrides: Partial<Parameters<CreateHoliday['execute']>[0]> = {}) {
    return create.execute({
      name: { fr: 'H', ar: 'ع' },
      kind: 'fixed',
      startDate: '2026-07-30',
      endDate: '2026-07-30',
      centerCode: CENTER,
      deviceOrigin: DEVICE,
      updatedBy: USER,
      ...overrides,
    });
  }

  it('returns active holidays ordered by startDate then French name', async () => {
    await seed({ name: { fr: 'Trône', ar: 'ع' }, startDate: '2026-07-30', endDate: '2026-07-30' });
    await seed({ name: { fr: 'Nouvel An', ar: 'ع' }, startDate: '2026-01-01', endDate: '2026-01-01' });
    await seed({ name: { fr: 'Marche Verte', ar: 'ع' }, startDate: '2026-11-06', endDate: '2026-11-06' });

    const result = await list.execute({ centerCode: CENTER, scope: 'active' });
    expect(result.map((h: Holiday) => h.name.fr)).toEqual(['Nouvel An', 'Trône', 'Marche Verte']);
  });

  it('breaks a startDate tie by French name', async () => {
    await seed({ name: { fr: 'Zeta', ar: 'ع' }, startDate: '2026-05-01', endDate: '2026-05-01' });
    await seed({ name: { fr: 'Alpha', ar: 'ع' }, startDate: '2026-05-01', endDate: '2026-05-01' });

    const result = await list.execute({ centerCode: CENTER, scope: 'active' });
    expect(result.map((h: Holiday) => h.name.fr)).toEqual(['Alpha', 'Zeta']);
  });

  it('excludes tombstones from active and other centers', async () => {
    const gone = await seed({ name: { fr: 'Archivé', ar: 'ع' } });
    await new ArchiveHoliday(holidays, fakeClock(), plan).execute({
      centerCode: CENTER,
      holidayId: gone.id,
      updatedBy: USER,
    });
    await seed({ name: { fr: 'Étranger', ar: 'ع' }, centerCode: OTHER_CENTER });
    await seed({ name: { fr: 'Local', ar: 'ع' } });

    const active = await list.execute({ centerCode: CENTER, scope: 'active' });
    expect(active.map((h: Holiday) => h.name.fr)).toEqual(['Local']);
  });

  it('returns archived holidays under the archived scope', async () => {
    const gone = await seed({ name: { fr: 'Archivé', ar: 'ع' } });
    await new ArchiveHoliday(holidays, fakeClock(), plan).execute({
      centerCode: CENTER,
      holidayId: gone.id,
      updatedBy: USER,
    });

    const archived = await list.execute({ centerCode: CENTER, scope: 'archived' });
    expect(archived.map((h: Holiday) => h.name.fr)).toEqual(['Archivé']);
  });

  it('throws PlanFeatureUnavailableError when the plan lacks settings.holidays', async () => {
    const planWithout: Plan = {
      id: 'essentiel',
      features: new Set<FeatureFlag>(),
      limits: PLANS.essentiel.limits,
    };
    list = new ListHolidays(holidays, new PlanPolicy(planWithout));
    await expect(list.execute({ centerCode: CENTER, scope: 'active' })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
