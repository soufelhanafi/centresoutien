import { describe, it, expect, beforeEach } from 'vitest';
import { DeactivateFormula } from '../../../src/use-cases/deactivate-formula';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { FormulaNotFoundError } from '../../../src/errors/formula-errors';
import type { Formula, FormulaId } from '../../../src/entities/formula';
import type { SubjectId } from '../../../src/entities/subject';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryFormulaRepository } from '../fakes/in-memory-formula-repository';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const EDITOR = 'usr_00000000000000000000000002' as UserId;
const MATH = 'sub_00000000000000000000000003' as SubjectId;

const EDITED_AT = '2026-08-02T12:00:00Z';

function makeFormula(overrides: Partial<Formula> = {}): Formula {
  return {
    id: 'fml_00000000000000000000000001' as FormulaId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: new Date('2026-08-01T00:00:00Z'),
    updatedAt: new Date('2026-08-01T00:00:00Z'),
    updatedBy: USER,
    deletedAt: null,
    version: 3,
    name: { fr: 'Math seul', ar: 'رياضيات فقط' },
    subjectIds: [MATH],
    priceMad: 20000,
    kind: 'regular',
    isImmutable: false,
    active: true,
    ...overrides,
  };
}

describe('DeactivateFormula', () => {
  let formulas: InMemoryFormulaRepository;
  let useCase: DeactivateFormula;

  beforeEach(() => {
    formulas = new InMemoryFormulaRepository();
    useCase = new DeactivateFormula(formulas, fakeClock(EDITED_AT), new PlanPolicy(PLANS.essentiel));
  });

  describe('happy path', () => {
    it('sets active to false on a mutable formula, stamping updatedAt/updatedBy', async () => {
      const original = makeFormula({ isImmutable: false, active: true });
      await formulas.save(original);

      const result = await useCase.execute({ centerCode: CENTER, id: original.id, updatedBy: EDITOR });

      expect(result.active).toBe(false);
      expect(result.updatedBy).toBe(EDITOR);
      expect(result.updatedAt).toEqual(new Date(EDITED_AT));
      expect(result.id).toBe(original.id);
      expect(result.version).toBe(original.version);
      expect(await formulas.findById(original.id)).toEqual(result);
    });

    it('sets active to false on an immutable formula — this is the whole point (bypasses FormulaImmutableError)', async () => {
      const original = makeFormula({ isImmutable: true, active: true });
      await formulas.save(original);

      const result = await useCase.execute({ centerCode: CENTER, id: original.id, updatedBy: EDITOR });

      expect(result.active).toBe(false);
      expect(result.isImmutable).toBe(true);
      expect(result.name).toEqual(original.name);
      expect(result.priceMad).toBe(original.priceMad);
      expect(result.subjectIds).toEqual(original.subjectIds);
    });

    it('never touches version — that is the hub-assigned counter', async () => {
      const original = makeFormula({ version: 5 });
      await formulas.save(original);
      const result = await useCase.execute({ centerCode: CENTER, id: original.id, updatedBy: EDITOR });
      expect(result.version).toBe(5);
    });
  });

  describe('idempotent no-op', () => {
    it('does not bump updatedAt when the formula is already inactive', async () => {
      const original = makeFormula({ active: false });
      await formulas.save(original);

      const result = await useCase.execute({ centerCode: CENTER, id: original.id, updatedBy: EDITOR });

      expect(result.active).toBe(false);
      expect(result.updatedAt).toEqual(original.updatedAt);
      expect(result.updatedBy).toBe(original.updatedBy);
      expect(await formulas.findById(original.id)).toEqual(original);
    });
  });

  describe('not found', () => {
    it('throws FormulaNotFoundError for an unknown id', async () => {
      await expect(
        useCase.execute({ centerCode: CENTER, id: 'fml_00000000000000000000000404' as FormulaId, updatedBy: EDITOR }),
      ).rejects.toBeInstanceOf(FormulaNotFoundError);
    });

    it('throws FormulaNotFoundError for a soft-deleted id', async () => {
      const original = makeFormula();
      await formulas.save(original);
      await formulas.softDelete(original.id, new Date(EDITED_AT), USER);
      await expect(
        useCase.execute({ centerCode: CENTER, id: original.id, updatedBy: EDITOR }),
      ).rejects.toBeInstanceOf(FormulaNotFoundError);
    });

    it('treats a foreign-center formula as not found (tenant scope)', async () => {
      const original = makeFormula();
      await formulas.save(original);
      await expect(
        useCase.execute({ centerCode: 'CS-RABAT-002' as CenterCode, id: original.id, updatedBy: EDITOR }),
      ).rejects.toBeInstanceOf(FormulaNotFoundError);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.formulas', async () => {
      const original = makeFormula();
      await formulas.save(original);
      const planWithout: Plan = { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };
      useCase = new DeactivateFormula(formulas, fakeClock(EDITED_AT), new PlanPolicy(planWithout));

      await expect(
        useCase.execute({ centerCode: CENTER, id: original.id, updatedBy: EDITOR }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });
  });
});
