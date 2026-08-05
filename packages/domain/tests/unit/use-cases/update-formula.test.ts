import { describe, it, expect, beforeEach } from 'vitest';
import { UpdateFormula, type UpdateFormulaInput } from '../../../src/use-cases/update-formula';
import { CreateFormula } from '../../../src/use-cases/create-formula';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import {
  FormulaImmutableError,
  FormulaNotFoundError,
  FormulaSubjectUnavailableError,
} from '../../../src/errors/formula-errors';
import type { Formula, FormulaId } from '../../../src/entities/formula';
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
const EDITOR = 'usr_00000000000000000000000002' as UserId;
const MATH = 'sub_00000000000000000000000003' as SubjectId;
const PHYS = 'sub_00000000000000000000000004' as SubjectId;

const CREATED_AT = '2026-08-01T10:00:00Z';
const EDITED_AT = '2026-08-02T12:00:00Z';

function updateInput(id: FormulaId, overrides: Partial<UpdateFormulaInput> = {}): UpdateFormulaInput {
  return {
    id,
    centerCode: CENTER,
    updatedBy: EDITOR,
    name: { fr: 'Math seul', ar: 'رياضيات فقط' },
    subjectIds: [MATH],
    priceMad: 20000,
    kind: 'regular',
    ...overrides,
  };
}

describe('UpdateFormula', () => {
  let formulas: InMemoryFormulaRepository;
  let subjects: InMemorySubjectRepository;
  let useCase: UpdateFormula;

  async function seedSubject(id: SubjectId, active = true): Promise<void> {
    await subjects.save({
      id,
      centerCode: CENTER,
      deviceOrigin: DEVICE,
      createdAt: new Date('2026-07-01T00:00:00Z'),
      updatedAt: new Date('2026-07-01T00:00:00Z'),
      updatedBy: USER,
      deletedAt: null,
      version: 0,
      name: { fr: id, ar: id },
      code: null,
      active,
    });
  }

  async function seed(overrides: Partial<Formula> = {}): Promise<Formula> {
    const create = new CreateFormula(
      formulas,
      subjects,
      fakeClock(CREATED_AT),
      fakeIds(),
      new PlanPolicy(PLANS.essentiel),
    );
    const created = await create.execute({
      name: { fr: 'Math + Physique', ar: 'رياضيات وفيزياء' },
      subjectIds: [MATH, PHYS],
      priceMad: 35000,
      kind: 'regular',
      centerCode: CENTER,
      deviceOrigin: DEVICE,
      updatedBy: USER,
    });
    if (Object.keys(overrides).length === 0) return created;
    const patched = { ...created, ...overrides };
    await formulas.save(patched);
    return patched;
  }

  beforeEach(async () => {
    formulas = new InMemoryFormulaRepository();
    subjects = new InMemorySubjectRepository();
    await seedSubject(MATH);
    await seedSubject(PHYS);
    useCase = new UpdateFormula(formulas, subjects, fakeClock(EDITED_AT), new PlanPolicy(PLANS.essentiel));
  });

  describe('happy path', () => {
    it('updates price/subjects/name and stamps updatedAt/updatedBy without touching identity', async () => {
      const original = await seed();

      const updated = await useCase.execute(
        updateInput(original.id, { name: { fr: 'Math seul', ar: 'رياضيات فقط' }, subjectIds: [MATH], priceMad: 20000 }),
      );

      expect(updated.name).toEqual({ fr: 'Math seul', ar: 'رياضيات فقط' });
      expect(updated.subjectIds).toEqual([MATH]);
      expect(updated.priceMad).toBe(20000);
      expect(updated.id).toBe(original.id);
      expect(updated.centerCode).toBe(CENTER);
      expect(updated.deviceOrigin).toBe(original.deviceOrigin);
      expect(updated.createdAt).toEqual(original.createdAt);
      expect(updated.version).toBe(original.version);
      expect(updated.updatedBy).toBe(EDITOR);
      expect(updated.updatedAt).toEqual(new Date(EDITED_AT));
      expect(updated.active).toBe(true); // untouched — active is not part of this input
      expect(await formulas.findById(original.id)).toEqual(updated);
    });

    it('switches kind to exam-prep on a plan with core.exam-prep', async () => {
      useCase = new UpdateFormula(formulas, subjects, fakeClock(EDITED_AT), new PlanPolicy(PLANS.pro));
      const original = await seed();
      const updated = await useCase.execute(updateInput(original.id, { kind: 'exam-prep' }));
      expect(updated.kind).toBe('exam-prep');
    });
  });

  describe('no-op', () => {
    it('does not bump updatedAt or persist a delta when nothing changed', async () => {
      const original = await seed();

      const result = await useCase.execute(
        updateInput(original.id, {
          name: original.name,
          subjectIds: [...original.subjectIds],
          priceMad: original.priceMad,
          kind: original.kind,
        }),
      );

      expect(result.updatedAt).toEqual(original.updatedAt);
      expect(result.updatedBy).toBe(original.updatedBy);
      expect(await formulas.findById(original.id)).toEqual(original);
    });
  });

  describe('not found', () => {
    it('throws FormulaNotFoundError for an unknown id', async () => {
      await expect(
        useCase.execute(updateInput('fml_00000000000000000000000404' as FormulaId)),
      ).rejects.toBeInstanceOf(FormulaNotFoundError);
    });

    it('throws FormulaNotFoundError for a soft-deleted id', async () => {
      const original = await seed();
      await formulas.softDelete(original.id, new Date(EDITED_AT), USER);
      await expect(useCase.execute(updateInput(original.id))).rejects.toBeInstanceOf(FormulaNotFoundError);
    });

    it('treats a foreign-center formula as not found (tenant scope)', async () => {
      const original = await seed();
      await expect(
        useCase.execute(updateInput(original.id, { centerCode: 'CS-RABAT-002' as CenterCode })),
      ).rejects.toBeInstanceOf(FormulaNotFoundError);
    });
  });

  describe('the immutability barrier', () => {
    it('rejects every patch once isImmutable is true, including a no-op', async () => {
      const original = await seed({ isImmutable: true });
      await expect(
        useCase.execute(
          updateInput(original.id, {
            name: original.name,
            subjectIds: [...original.subjectIds],
            priceMad: original.priceMad,
            kind: original.kind,
          }),
        ),
      ).rejects.toBeInstanceOf(FormulaImmutableError);
    });
  });

  describe('subject validation', () => {
    it('rejects an unknown subject id', async () => {
      const original = await seed();
      const bogus = 'sub_00000000000000000000000099' as SubjectId;
      await expect(
        useCase.execute(updateInput(original.id, { subjectIds: [bogus] })),
      ).rejects.toBeInstanceOf(FormulaSubjectUnavailableError);
    });

    it('rejects an inactive subject id', async () => {
      const original = await seed();
      await seedSubject(MATH, false);
      await expect(
        useCase.execute(updateInput(original.id, { subjectIds: [MATH] })),
      ).rejects.toBeInstanceOf(FormulaSubjectUnavailableError);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.formulas', async () => {
      const original = await seed();
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      useCase = new UpdateFormula(formulas, subjects, fakeClock(EDITED_AT), new PlanPolicy(planWithout));

      await expect(useCase.execute(updateInput(original.id))).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
    });

    it('rejects switching to exam-prep when the plan lacks core.exam-prep', async () => {
      const original = await seed();
      useCase = new UpdateFormula(
        formulas,
        subjects,
        fakeClock(EDITED_AT),
        new PlanPolicy(planWithoutFeature('core.exam-prep')),
      );
      await expect(
        useCase.execute(updateInput(original.id, { kind: 'exam-prep' })),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });
  });

  describe('validation', () => {
    it('rejects a blank French name', async () => {
      const original = await seed();
      await expect(
        useCase.execute(updateInput(original.id, { name: { fr: '   ', ar: 'فيزياء' } })),
      ).rejects.toThrow();
    });

    it('rejects an empty subjectIds array', async () => {
      const original = await seed();
      await expect(useCase.execute(updateInput(original.id, { subjectIds: [] }))).rejects.toThrow();
    });
  });
});
