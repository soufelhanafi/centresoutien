import { describe, it, expect, beforeEach } from 'vitest';
import { CreateParent, type CreateParentInput } from '../../../src/use-cases/create-parent';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { DuplicateParentError } from '../../../src/errors/people-errors';
import { normalizeNaturalKey } from '../../../src/policies/natural-key';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryParentRepository } from '../fakes/in-memory-parent-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

function validInput(overrides: Partial<CreateParentInput> = {}): CreateParentInput {
  return {
    name: '  Ahmed Benali ',
    phone: '06 12 34 56 78',
    email: '  ahmed@benali.ma ',
    relation: 'pere',
    whatsappOptIn: true,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

describe('CreateParent', () => {
  let parents: InMemoryParentRepository;
  let useCase: CreateParent;

  beforeEach(() => {
    parents = new InMemoryParentRepository();
    // core.parents lives on Essentiel+ — build the policy from a plan that has it.
    useCase = new CreateParent(parents, fakeClock('2026-07-29T10:00:00Z'), fakeIds(), new PlanPolicy(PLANS.essentiel));
  });

  describe('happy path', () => {
    it('creates a parent with a prefixed id, normalized phone, trimmed name, and a fresh envelope', async () => {
      const parent = await useCase.execute(validInput());

      expect(parent.id).toMatch(/^prt_/);
      expect(parent.name).toBe('Ahmed Benali');
      expect(parent.phone).toBe('+212612345678');
      expect(parent.email).toBe('ahmed@benali.ma');
      expect(parent.relation).toBe('pere');
      expect(parent.whatsappOptIn).toBe(true);
      expect(parent.centerCode).toBe(CENTER);
      expect(parent.deviceOrigin).toBe(DEVICE);
      expect(parent.updatedBy).toBe(USER);
      expect(parent.createdAt).toEqual(new Date('2026-07-29T10:00:00Z'));
      expect(parent.updatedAt).toEqual(parent.createdAt);
      expect(parent.deletedAt).toBeNull();
      expect(parent.version).toBe(0);
    });

    it('derives the naturalKey from the center + name + canonical phone', async () => {
      const parent = await useCase.execute(validInput());
      expect(parent.naturalKey).toBe(
        normalizeNaturalKey({ centerCode: CENTER, fullName: 'Ahmed Benali', contact: '+212612345678' }),
      );
      expect(await parents.findByNaturalKey(parent.naturalKey)).toEqual(parent);
    });

    it('collapses a blank email to null', async () => {
      const parent = await useCase.execute(validInput({ email: '   ' }));
      expect(parent.email).toBeNull();
    });

    it('persists the parent so it can be read back by id', async () => {
      const parent = await useCase.execute(validInput());
      expect(await parents.findById(parent.id)).toEqual(parent);
    });
  });

  describe('shared family phone', () => {
    it('allows two guardians on the same number (different names → both saved)', async () => {
      const father = await useCase.execute(validInput({ name: 'Ahmed Benali', phone: '0612345678', relation: 'pere' }));
      const mother = await useCase.execute(validInput({ name: 'Salma Benali', phone: '0612345678', relation: 'mere' }));

      expect(father.phone).toBe(mother.phone);
      expect(father.naturalKey).not.toBe(mother.naturalKey);
      expect(parents.all()).toHaveLength(2);
    });
  });

  describe('exact duplicate', () => {
    it('rejects a same-name + same-phone guardian with a typed DuplicateParentError and saves nothing new', async () => {
      const first = await useCase.execute(validInput());

      // Same name + phone (after normalization) → same naturalKey → a genuine duplicate.
      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(DuplicateParentError);
      await expect(useCase.execute(validInput())).rejects.toMatchObject({ naturalKey: first.naturalKey });
      expect(parents.all()).toHaveLength(1);
    });

    it('allows recreating a guardian whose only match was soft-deleted (tombstone frees the key)', async () => {
      const first = await useCase.execute(validInput());
      await parents.softDelete(first.id, new Date('2026-08-02T00:00:00Z'));

      const recreated = await useCase.execute(validInput());
      expect(recreated.id).not.toBe(first.id);
      expect(recreated.naturalKey).toBe(first.naturalKey);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.parents', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(['core.students']),
        limits: PLANS.essentiel.limits,
      };
      useCase = new CreateParent(parents, fakeClock(), fakeIds(), new PlanPolicy(planWithout));

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(parents.all()).toHaveLength(0);
    });
  });

  describe('validation', () => {
    it('rejects a blank name', async () => {
      await expect(useCase.execute(validInput({ name: '   ' }))).rejects.toThrow();
      expect(parents.all()).toHaveLength(0);
    });

    it('rejects a missing phone (the required matching anchor)', async () => {
      await expect(useCase.execute(validInput({ phone: '' }))).rejects.toThrow();
    });

    it('rejects a garbage phone', async () => {
      await expect(useCase.execute(validInput({ phone: 'abc' }))).rejects.toThrow();
    });

    it('rejects an invalid relation', async () => {
      await expect(
        useCase.execute(validInput({ relation: 'oncle' as CreateParentInput['relation'] })),
      ).rejects.toThrow();
    });
  });

  describe('soft delete', () => {
    it('hides a deleted parent from findById while keeping the tombstone in the sync feed', async () => {
      const parent = await useCase.execute(validInput());
      await parents.softDelete(parent.id, new Date('2026-08-02T00:00:00Z'));

      expect(await parents.findById(parent.id)).toBeNull();
      expect(await parents.findByNaturalKey(parent.naturalKey)).toBeNull();
      const changed = await parents.listChangedSince(new Date('2026-07-01T00:00:00Z'));
      expect(changed).toHaveLength(1);
      expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
    });
  });
});
