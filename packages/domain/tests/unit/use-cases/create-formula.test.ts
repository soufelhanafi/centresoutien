import { describe, it, expect, beforeEach } from 'vitest';
import { CreateFormula, type CreateFormulaInput } from '../../../src/use-cases/create-formula';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { FormulaSubjectUnavailableError } from '../../../src/errors/formula-errors';
import type { SubjectId } from '../../../src/entities/subject';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryFormulaRepository } from '../fakes/in-memory-formula-repository';
import { InMemorySubjectRepository } from '../fakes/in-memory-subject-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import { planWithoutFeature } from '../fakes/plans';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const MATH = 'sub_00000000000000000000000003' as SubjectId;
const PHYS = 'sub_00000000000000000000000004' as SubjectId;

function validInput(overrides: Partial<CreateFormulaInput> = {}): CreateFormulaInput {
  return {
    name: { fr: 'Math + Physique', ar: 'رياضيات وفيزياء' },
    subjectIds: [MATH, PHYS],
    priceMad: 35000,
    kind: 'regular',
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

describe('CreateFormula', () => {
  let formulas: InMemoryFormulaRepository;
  let subjects: InMemorySubjectRepository;
  let useCase: CreateFormula;

  beforeEach(async () => {
    formulas = new InMemoryFormulaRepository();
    subjects = new InMemorySubjectRepository();
    await subjects.save({
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
    });
    await subjects.save({
      id: PHYS,
      centerCode: CENTER,
      deviceOrigin: DEVICE,
      createdAt: new Date('2026-07-01T00:00:00Z'),
      updatedAt: new Date('2026-07-01T00:00:00Z'),
      updatedBy: USER,
      deletedAt: null,
      version: 0,
      name: { fr: 'Physique', ar: 'الفيزياء' },
      code: null,
      active: true,
    });
    useCase = new CreateFormula(
      formulas,
      subjects,
      fakeClock('2026-08-02T10:00:00Z'),
      fakeIds(),
      new PlanPolicy(PLANS.essentiel),
    );
  });

  describe('happy path', () => {
    it('creates an active, mutable formula with a prefixed id and a fresh envelope', async () => {
      const formula = await useCase.execute(validInput());

      expect(formula.id).toMatch(/^fml_/);
      expect(formula.name).toEqual({ fr: 'Math + Physique', ar: 'رياضيات وفيزياء' });
      expect(formula.subjectIds).toEqual([MATH, PHYS]);
      expect(formula.priceMad).toBe(35000);
      expect(formula.kind).toBe('regular');
      expect(formula.isImmutable).toBe(false);
      expect(formula.active).toBe(true);
      expect(formula.centerCode).toBe(CENTER);
      expect(formula.deviceOrigin).toBe(DEVICE);
      expect(formula.createdAt).toEqual(new Date('2026-08-02T10:00:00Z'));
      expect(formula.updatedAt).toEqual(formula.createdAt);
      expect(formula.deletedAt).toBeNull();
      expect(formula.version).toBe(0);
    });

    it('persists the formula so it can be read back by id', async () => {
      const formula = await useCase.execute(validInput());
      expect(await formulas.findById(formula.id)).toEqual(formula);
    });

    it('creates an exam-prep formula on a plan with core.exam-prep', async () => {
      useCase = new CreateFormula(formulas, subjects, fakeClock(), fakeIds(), new PlanPolicy(PLANS.pro));
      const formula = await useCase.execute(validInput({ kind: 'exam-prep' }));
      expect(formula.kind).toBe('exam-prep');
    });
  });

  describe('subject validation', () => {
    it('rejects an unknown subject id', async () => {
      const bogus = 'sub_00000000000000000000000099' as SubjectId;
      await expect(useCase.execute(validInput({ subjectIds: [bogus] }))).rejects.toBeInstanceOf(
        FormulaSubjectUnavailableError,
      );
      expect(formulas.all()).toHaveLength(0);
    });

    it('rejects an inactive subject id', async () => {
      await subjects.save({
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
        active: false,
      });
      await expect(useCase.execute(validInput({ subjectIds: [MATH] }))).rejects.toBeInstanceOf(
        FormulaSubjectUnavailableError,
      );
    });

    it('rejects a subject id belonging to another center', async () => {
      const foreign = 'sub_00000000000000000000000005' as SubjectId;
      await subjects.save({
        id: foreign,
        centerCode: 'CS-RABAT-002' as CenterCode,
        deviceOrigin: DEVICE,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        updatedAt: new Date('2026-07-01T00:00:00Z'),
        updatedBy: USER,
        deletedAt: null,
        version: 0,
        name: { fr: 'Chimie', ar: 'الكيمياء' },
        code: null,
        active: true,
      });
      await expect(useCase.execute(validInput({ subjectIds: [foreign] }))).rejects.toBeInstanceOf(
        FormulaSubjectUnavailableError,
      );
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.formulas', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      useCase = new CreateFormula(formulas, subjects, fakeClock(), fakeIds(), new PlanPolicy(planWithout));

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(formulas.all()).toHaveLength(0);
    });

    it('rejects an exam-prep formula when the plan lacks core.exam-prep', async () => {
      useCase = new CreateFormula(
        formulas,
        subjects,
        fakeClock(),
        fakeIds(),
        new PlanPolicy(planWithoutFeature('core.exam-prep')),
      );
      await expect(useCase.execute(validInput({ kind: 'exam-prep' }))).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
      expect(formulas.all()).toHaveLength(0);
    });
  });

  describe('validation', () => {
    it('rejects a blank French name', async () => {
      await expect(
        useCase.execute(validInput({ name: { fr: '   ', ar: 'رياضيات' } })),
      ).rejects.toThrow();
    });

    it('rejects an empty subjectIds array', async () => {
      await expect(useCase.execute(validInput({ subjectIds: [] }))).rejects.toThrow();
    });

    it('rejects a non-positive price', async () => {
      await expect(useCase.execute(validInput({ priceMad: 0 }))).rejects.toThrow();
    });

    it('persists nothing when validation fails', async () => {
      await expect(useCase.execute(validInput({ priceMad: -1 }))).rejects.toThrow();
      expect(formulas.all()).toHaveLength(0);
    });
  });
});
