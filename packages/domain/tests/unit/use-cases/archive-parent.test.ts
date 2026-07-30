import { describe, it, expect, beforeEach } from 'vitest';
import { ArchiveParent } from '../../../src/use-cases/archive-parent';
import { CreateParent, type CreateParentInput } from '../../../src/use-cases/create-parent';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { ParentNotFoundError } from '../../../src/errors/people-errors';
import type { ParentId } from '../../../src/entities/parent';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryParentRepository } from '../fakes/in-memory-parent-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const ARCHIVER = 'usr_00000000000000000000000002' as UserId;

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

describe('ArchiveParent', () => {
  let parents: InMemoryParentRepository;
  let create: CreateParent;
  let archive: ArchiveParent;

  beforeEach(() => {
    parents = new InMemoryParentRepository();
    const plan = new PlanPolicy(PLANS.essentiel);
    create = new CreateParent(parents, fakeClock('2026-07-29T10:00:00Z'), fakeIds(), plan);
    archive = new ArchiveParent(parents, fakeClock('2026-08-02T00:00:00Z'), plan);
  });

  it('soft-deletes the parent and stamps who archived on the tombstone', async () => {
    const created = await create.execute(validInput());
    await archive.execute({ centerCode: CENTER, id: created.id, updatedBy: ARCHIVER });

    // Hidden from live reads…
    expect(await parents.findById(created.id)).toBeNull();
    expect(await parents.findByNaturalKey(created.naturalKey)).toBeNull();
    // …but present as a tombstone in the sync feed, attributed to the archiver.
    const changed = await parents.listChangedSince(new Date('2026-07-01T00:00:00Z'));
    expect(changed).toHaveLength(1);
    expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
    expect(changed[0]?.updatedBy).toBe(ARCHIVER);
  });

  it('frees the natural key so an identical guardian can be recreated', async () => {
    const first = await create.execute(validInput());
    await archive.execute({ centerCode: CENTER, id: first.id, updatedBy: ARCHIVER });
    const recreated = await create.execute(validInput());
    expect(recreated.id).not.toBe(first.id);
    expect(recreated.naturalKey).toBe(first.naturalKey);
  });

  it('throws ParentNotFoundError for an unknown id', async () => {
    await expect(
      archive.execute({ centerCode: CENTER, id: 'prt_missing' as ParentId, updatedBy: ARCHIVER }),
    ).rejects.toBeInstanceOf(ParentNotFoundError);
  });

  it('throws ParentNotFoundError for an already-archived id', async () => {
    const created = await create.execute(validInput());
    await archive.execute({ centerCode: CENTER, id: created.id, updatedBy: ARCHIVER });
    await expect(
      archive.execute({ centerCode: CENTER, id: created.id, updatedBy: ARCHIVER }),
    ).rejects.toBeInstanceOf(ParentNotFoundError);
  });

  it('treats a foreign-tenant parent as not-found and does not archive it', async () => {
    const created = await create.execute(validInput());
    await expect(
      archive.execute({ centerCode: OTHER, id: created.id, updatedBy: ARCHIVER }),
    ).rejects.toBeInstanceOf(ParentNotFoundError);
    expect(await parents.findById(created.id)).not.toBeNull();
  });

  it('is gated by core.parents', async () => {
    const locked = new ArchiveParent(parents, fakeClock(), new PlanPolicy(planWithoutParents()));
    await expect(
      locked.execute({ centerCode: CENTER, id: 'prt_x' as ParentId, updatedBy: ARCHIVER }),
    ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
  });
});
