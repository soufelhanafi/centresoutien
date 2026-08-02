import { describe, it, expect, beforeEach } from 'vitest';
import { CloneFormula } from '../../../src/use-cases/clone-formula';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { FormulaNotFoundError, FormulaSubjectUnavailableError } from '../../../src/errors/formula-errors';
import type { Formula, FormulaId } from '../../../src/entities/formula';
import type { Subject, SubjectId } from '../../../src/entities/subject';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryFormulaRepository } from '../fakes/in-memory-formula-repository';
import { InMemorySubjectRepository } from '../fakes/in-memory-subject-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const MATH = 'sub_00000000000000000000000003' as SubjectId;

function makeSubject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: MATH,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    name: { fr: 'Mathématiques', ar: 'الرياضيات' },
    code: null,
    active: true,
    ...overrides,
  };
}

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
    isImmutable: true,
    active: true,
    ...overrides,
  };
}

describe('CloneFormula', () => {
  let formulas: InMemoryFormulaRepository;
  let subjects: InMemorySubjectRepository;
  let useCase: CloneFormula;

  beforeEach(async () => {
    formulas = new InMemoryFormulaRepository();
    subjects = new InMemorySubjectRepository();
    await subjects.save(makeSubject());
    useCase = new CloneFormula(
      formulas,
      subjects,
      fakeClock('2026-08-03T09:00:00Z'),
      fakeIds(2), // seed 2 — the source formula already occupies the seed-1 id
      new PlanPolicy(PLANS.essentiel),
    );
  });

  describe('happy path', () => {
    it('clones an immutable formula into a fresh, mutable, active copy', async () => {
      const source = makeFormula();
      await formulas.save(source);

      const clone = await useCase.execute({
        centerCode: CENTER,
        sourceId: source.id,
        deviceOrigin: DEVICE,
        updatedBy: USER,
      });

      expect(clone.id).not.toBe(source.id);
      expect(clone.id).toMatch(/^fml_/);
      expect(clone.name).toEqual(source.name);
      expect(clone.subjectIds).toEqual(source.subjectIds);
      expect(clone.priceMad).toBe(source.priceMad);
      expect(clone.kind).toBe(source.kind);
      expect(clone.isImmutable).toBe(false);
      expect(clone.active).toBe(true);
      expect(clone.version).toBe(0);
      expect(clone.createdAt).toEqual(new Date('2026-08-03T09:00:00Z'));
    });

    it('does not mutate the source formula', async () => {
      const source = makeFormula();
      await formulas.save(source);
      await useCase.execute({ centerCode: CENTER, sourceId: source.id, deviceOrigin: DEVICE, updatedBy: USER });
      expect(await formulas.findById(source.id)).toEqual(source);
    });

    it('persists the clone so it can be read back by id', async () => {
      const source = makeFormula();
      await formulas.save(source);
      const clone = await useCase.execute({
        centerCode: CENTER,
        sourceId: source.id,
        deviceOrigin: DEVICE,
        updatedBy: USER,
      });
      expect(await formulas.findById(clone.id)).toEqual(clone);
    });

    it('clones a mutable formula too', async () => {
      const source = makeFormula({ isImmutable: false });
      await formulas.save(source);
      const clone = await useCase.execute({
        centerCode: CENTER,
        sourceId: source.id,
        deviceOrigin: DEVICE,
        updatedBy: USER,
      });
      expect(clone.isImmutable).toBe(false);
    });

    it('clones an exam-prep formula on a plan with core.exam-prep', async () => {
      useCase = new CloneFormula(formulas, subjects, fakeClock(), fakeIds(2), new PlanPolicy(PLANS.pro));
      const source = makeFormula({ kind: 'exam-prep' });
      await formulas.save(source);
      const clone = await useCase.execute({
        centerCode: CENTER,
        sourceId: source.id,
        deviceOrigin: DEVICE,
        updatedBy: USER,
      });
      expect(clone.kind).toBe('exam-prep');
    });
  });

  describe('not found', () => {
    it('throws FormulaNotFoundError for an unknown source id', async () => {
      await expect(
        useCase.execute({
          centerCode: CENTER,
          sourceId: 'fml_00000000000000000000000404' as FormulaId,
          deviceOrigin: DEVICE,
          updatedBy: USER,
        }),
      ).rejects.toBeInstanceOf(FormulaNotFoundError);
    });

    it('throws FormulaNotFoundError for a soft-deleted source', async () => {
      const source = makeFormula();
      await formulas.save(source);
      await formulas.softDelete(source.id, new Date('2026-08-02T00:00:00Z'), USER);
      await expect(
        useCase.execute({ centerCode: CENTER, sourceId: source.id, deviceOrigin: DEVICE, updatedBy: USER }),
      ).rejects.toBeInstanceOf(FormulaNotFoundError);
    });

    it('treats a foreign-center source as not found (tenant scope)', async () => {
      const source = makeFormula();
      await formulas.save(source);
      await expect(
        useCase.execute({
          centerCode: 'CS-RABAT-002' as CenterCode,
          sourceId: source.id,
          deviceOrigin: DEVICE,
          updatedBy: USER,
        }),
      ).rejects.toBeInstanceOf(FormulaNotFoundError);
    });
  });

  describe('subject validation', () => {
    it('rejects cloning when a bundled subject has since been deactivated', async () => {
      const source = makeFormula();
      await formulas.save(source);
      await subjects.save(makeSubject({ active: false }));

      await expect(
        useCase.execute({ centerCode: CENTER, sourceId: source.id, deviceOrigin: DEVICE, updatedBy: USER }),
      ).rejects.toBeInstanceOf(FormulaSubjectUnavailableError);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.formulas', async () => {
      const source = makeFormula();
      await formulas.save(source);
      const planWithout: Plan = { id: 'essentiel', features: new Set<FeatureFlag>(), limits: PLANS.essentiel.limits };
      useCase = new CloneFormula(formulas, subjects, fakeClock(), fakeIds(2), new PlanPolicy(planWithout));

      await expect(
        useCase.execute({ centerCode: CENTER, sourceId: source.id, deviceOrigin: DEVICE, updatedBy: USER }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });

    it('rejects cloning an exam-prep source on Essentiel', async () => {
      const source = makeFormula({ kind: 'exam-prep' });
      await formulas.save(source);
      await expect(
        useCase.execute({ centerCode: CENTER, sourceId: source.id, deviceOrigin: DEVICE, updatedBy: USER }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });
  });
});
