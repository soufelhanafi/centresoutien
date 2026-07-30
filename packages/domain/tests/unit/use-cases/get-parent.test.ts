import { describe, it, expect, beforeEach } from 'vitest';
import { GetParent } from '../../../src/use-cases/get-parent';
import { ArchiveParent } from '../../../src/use-cases/archive-parent';
import { CreateParent, type CreateParentInput } from '../../../src/use-cases/create-parent';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { ParentId } from '../../../src/entities/parent';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryParentRepository } from '../fakes/in-memory-parent-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

function validInput(): CreateParentInput {
  return {
    name: 'Ahmed Benali',
    phone: '0612345678',
    email: null,
    relation: 'pere',
    whatsappOptIn: false,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
  };
}

function planWithoutParents(): Plan {
  return { id: 'essentiel', features: new Set<FeatureFlag>(['core.students']), limits: PLANS.essentiel.limits };
}

describe('GetParent', () => {
  let parents: InMemoryParentRepository;
  let create: CreateParent;
  let get: GetParent;
  let archive: ArchiveParent;

  beforeEach(() => {
    parents = new InMemoryParentRepository();
    const plan = new PlanPolicy(PLANS.essentiel);
    create = new CreateParent(parents, fakeClock(), fakeIds(), plan);
    get = new GetParent(parents, plan);
    archive = new ArchiveParent(parents, fakeClock(), plan);
  });

  it('returns the parent for a known id', async () => {
    const created = await create.execute(validInput());
    const found = await get.execute({ centerCode: CENTER, id: created.id });
    expect(found?.id).toBe(created.id);
    expect(found?.name).toBe('Ahmed Benali');
  });

  it('returns null for an unknown id', async () => {
    expect(await get.execute({ centerCode: CENTER, id: 'prt_does-not-exist' as ParentId })).toBeNull();
  });

  it('returns null for a parent in another center (tenant scope)', async () => {
    const created = await create.execute(validInput());
    expect(await get.execute({ centerCode: OTHER, id: created.id })).toBeNull();
  });

  it('returns null for an archived parent (tombstone hidden)', async () => {
    const created = await create.execute(validInput());
    await archive.execute({ centerCode: CENTER, id: created.id, updatedBy: USER });
    expect(await get.execute({ centerCode: CENTER, id: created.id })).toBeNull();
  });

  it('is gated by core.parents', async () => {
    const locked = new GetParent(parents, new PlanPolicy(planWithoutParents()));
    await expect(
      locked.execute({ centerCode: CENTER, id: 'prt_x' as ParentId }),
    ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
  });
});
