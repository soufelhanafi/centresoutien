import { describe, it, expect, beforeEach } from 'vitest';
import { UpdateParent, type UpdateParentInput } from '../../../src/use-cases/update-parent';
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
const EDITOR = 'usr_00000000000000000000000002' as UserId;

function createInput(): CreateParentInput {
  return {
    name: 'Ahmed Benali',
    phone: '0612345678',
    email: 'ahmed@benali.ma',
    relation: 'pere',
    whatsappOptIn: false,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
  };
}

function editInput(id: ParentId, overrides: Partial<UpdateParentInput> = {}): UpdateParentInput {
  return {
    name: 'Ahmed B. Alaoui',
    phone: '0612345678',
    email: null,
    relation: 'tuteur',
    whatsappOptIn: true,
    centerCode: CENTER,
    id,
    updatedBy: EDITOR,
    ...overrides,
  };
}

function planWithoutParents(): Plan {
  return { id: 'essentiel', features: new Set<FeatureFlag>(['core.students']), limits: PLANS.essentiel.limits };
}

describe('UpdateParent', () => {
  let parents: InMemoryParentRepository;
  let create: CreateParent;
  let update: UpdateParent;

  beforeEach(() => {
    parents = new InMemoryParentRepository();
    const plan = new PlanPolicy(PLANS.essentiel);
    create = new CreateParent(parents, fakeClock('2026-07-29T10:00:00Z'), fakeIds(), plan);
    // A later clock so we can assert updatedAt advanced.
    update = new UpdateParent(parents, fakeClock('2026-08-01T12:00:00Z'), plan);
  });

  it('edits the user-facing fields and advances updatedAt/updatedBy', async () => {
    const created = await create.execute(createInput());
    const updated = await update.execute(editInput(created.id));

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('Ahmed B. Alaoui');
    expect(updated.relation).toBe('tuteur');
    expect(updated.whatsappOptIn).toBe(true);
    expect(updated.email).toBeNull();
    expect(updated.updatedBy).toBe(EDITOR);
    expect(updated.updatedAt).toEqual(new Date('2026-08-01T12:00:00Z'));
    // Persisted.
    expect(await parents.findById(created.id)).toEqual(updated);
  });

  it('preserves identity, provenance, and the immutable naturalKey even when the name changes', async () => {
    const created = await create.execute(createInput());
    const updated = await update.execute(editInput(created.id, { name: 'Totally Different Name' }));

    expect(updated.naturalKey).toBe(created.naturalKey);
    expect(updated.centerCode).toBe(created.centerCode);
    expect(updated.deviceOrigin).toBe(created.deviceOrigin);
    expect(updated.createdAt).toEqual(created.createdAt);
    expect(updated.version).toBe(created.version);
  });

  it('normalizes the phone through the shared schema', async () => {
    const created = await create.execute(createInput());
    const updated = await update.execute(editInput(created.id, { phone: '06 11 22 33 44' }));
    expect(updated.phone).toBe('+212611223344');
  });

  it('throws ParentNotFoundError for an unknown id', async () => {
    await expect(update.execute(editInput('prt_missing' as ParentId))).rejects.toBeInstanceOf(
      ParentNotFoundError,
    );
  });

  it('throws ParentNotFoundError for an archived id', async () => {
    const created = await create.execute(createInput());
    await parents.softDelete(created.id, new Date('2026-07-30T00:00:00Z'), USER);
    await expect(update.execute(editInput(created.id))).rejects.toBeInstanceOf(ParentNotFoundError);
  });

  it('treats a foreign-tenant parent as not-found', async () => {
    const created = await create.execute(createInput());
    await expect(
      update.execute(editInput(created.id, { centerCode: OTHER })),
    ).rejects.toBeInstanceOf(ParentNotFoundError);
  });

  it('rejects an invalid edit (blank name) and leaves the row untouched', async () => {
    const created = await create.execute(createInput());
    await expect(update.execute(editInput(created.id, { name: '   ' }))).rejects.toThrow();
    expect((await parents.findById(created.id))?.name).toBe('Ahmed Benali');
  });

  it('is gated by core.parents', async () => {
    const created = await create.execute(createInput());
    const locked = new UpdateParent(parents, fakeClock(), new PlanPolicy(planWithoutParents()));
    await expect(locked.execute(editInput(created.id))).rejects.toBeInstanceOf(
      PlanFeatureUnavailableError,
    );
  });
});
