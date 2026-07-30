import { describe, it, expect, beforeEach } from 'vitest';
import { ListParents } from '../../../src/use-cases/list-parents';
import { CreateParent, type CreateParentInput } from '../../../src/use-cases/create-parent';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryParentRepository } from '../fakes/in-memory-parent-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

function parentInput(overrides: Partial<CreateParentInput> = {}): CreateParentInput {
  return {
    name: 'Ahmed Benali',
    phone: '0612345678',
    email: null,
    relation: 'pere',
    whatsappOptIn: false,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

function planWithoutParents(): Plan {
  return { id: 'essentiel', features: new Set<FeatureFlag>(['core.students']), limits: PLANS.essentiel.limits };
}

describe('ListParents', () => {
  let parents: InMemoryParentRepository;
  let create: CreateParent;
  let list: ListParents;

  beforeEach(async () => {
    parents = new InMemoryParentRepository();
    const plan = new PlanPolicy(PLANS.essentiel);
    create = new CreateParent(parents, fakeClock(), fakeIds(), plan);
    list = new ListParents(parents, plan);

    await create.execute(parentInput({ name: 'Farès Zniber', phone: '0611111111' }));
    await create.execute(parentInput({ name: 'Ahmed Benali', phone: '0612345678' }));
    await create.execute(parentInput({ name: 'Salma Cherkaoui', phone: '0613333333' }));
  });

  it('returns every live guardian of the center, sorted by name', async () => {
    const result = await list.execute({ centerCode: CENTER, search: '' });
    expect(result.map((p) => p.name)).toEqual(['Ahmed Benali', 'Farès Zniber', 'Salma Cherkaoui']);
  });

  it('filters by an accent/case-insensitive name substring', async () => {
    const result = await list.execute({ centerCode: CENTER, search: 'fares' });
    expect(result.map((p) => p.name)).toEqual(['Farès Zniber']);
  });

  it('filters by phone substring', async () => {
    const result = await list.execute({ centerCode: CENTER, search: '2345678' });
    expect(result.map((p) => p.name)).toEqual(['Ahmed Benali']);
  });

  it('excludes guardians from another center (tenant scope)', async () => {
    await create.execute(parentInput({ name: 'Youssef Rabati', phone: '0699999999', centerCode: OTHER }));
    const result = await list.execute({ centerCode: OTHER, search: '' });
    expect(result.map((p) => p.name)).toEqual(['Youssef Rabati']);
  });

  it('excludes archived guardians', async () => {
    const all = await list.execute({ centerCode: CENTER, search: '' });
    const ahmed = all.find((p) => p.name === 'Ahmed Benali');
    await parents.softDelete(ahmed!.id, new Date('2026-08-02T00:00:00Z'), USER);
    const result = await list.execute({ centerCode: CENTER, search: '' });
    expect(result.map((p) => p.name)).toEqual(['Farès Zniber', 'Salma Cherkaoui']);
  });

  it('is gated by core.parents', async () => {
    const locked = new ListParents(parents, new PlanPolicy(planWithoutParents()));
    await expect(locked.execute({ centerCode: CENTER, search: '' })).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
