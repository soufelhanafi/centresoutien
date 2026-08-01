import { describe, it, expect, beforeEach } from 'vitest';
import { UpdateSubject, type UpdateSubjectInput } from '../../../src/use-cases/update-subject';
import { CreateSubject } from '../../../src/use-cases/create-subject';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { SubjectNotFoundError } from '../../../src/errors/subject-errors';
import type { Subject, SubjectId } from '../../../src/entities/subject';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemorySubjectRepository } from '../fakes/in-memory-subject-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const EDITOR = 'usr_00000000000000000000000002' as UserId;

const CREATED_AT = '2026-07-29T10:00:00Z';
const EDITED_AT = '2026-07-30T12:00:00Z';

function updateInput(id: SubjectId, overrides: Partial<UpdateSubjectInput> = {}): UpdateSubjectInput {
  return {
    id,
    centerCode: CENTER,
    updatedBy: EDITOR,
    name: { fr: 'Physique', ar: 'فيزياء' },
    active: true,
    ...overrides,
  };
}

describe('UpdateSubject', () => {
  let subjects: InMemorySubjectRepository;
  let useCase: UpdateSubject;

  async function seed(overrides: { code?: string } = {}): Promise<Subject> {
    const create = new CreateSubject(subjects, fakeClock(CREATED_AT), fakeIds(), new PlanPolicy(PLANS.essentiel));
    return create.execute({
      name: { fr: 'Mathématiques', ar: 'الرياضيات' },
      code: overrides.code,
      centerCode: CENTER,
      deviceOrigin: DEVICE,
      updatedBy: USER,
    });
  }

  beforeEach(() => {
    subjects = new InMemorySubjectRepository();
    useCase = new UpdateSubject(subjects, fakeClock(EDITED_AT), new PlanPolicy(PLANS.essentiel));
  });

  describe('happy path', () => {
    it('renames the subject and stamps updatedAt/updatedBy without touching identity', async () => {
      const original = await seed();

      const updated = await useCase.execute(updateInput(original.id, { name: { fr: 'Physique', ar: 'فيزياء' } }));

      expect(updated.name).toEqual({ fr: 'Physique', ar: 'فيزياء' });
      expect(updated.id).toBe(original.id);
      expect(updated.centerCode).toBe(CENTER);
      expect(updated.deviceOrigin).toBe(original.deviceOrigin);
      expect(updated.createdAt).toEqual(original.createdAt);
      expect(updated.version).toBe(original.version);
      expect(updated.updatedBy).toBe(EDITOR);
      expect(updated.updatedAt).toEqual(new Date(EDITED_AT));
      expect(await subjects.findById(original.id)).toEqual(updated);
    });

    it('deactivates an active subject (active → false)', async () => {
      const original = await seed();
      const updated = await useCase.execute(updateInput(original.id, { name: original.name, active: false }));
      expect(updated.active).toBe(false);
    });

    it('reactivates a deactivated subject (active → true)', async () => {
      const original = await seed();
      await useCase.execute(updateInput(original.id, { name: original.name, active: false }));

      const reactivated = await useCase.execute(updateInput(original.id, { name: original.name, active: true }));
      expect(reactivated.active).toBe(true);
    });

    it('trims the incoming name before saving', async () => {
      const original = await seed();
      const updated = await useCase.execute(
        updateInput(original.id, { name: { fr: '  Chimie ', ar: ' كيمياء ' } }),
      );
      expect(updated.name).toEqual({ fr: 'Chimie', ar: 'كيمياء' });
    });
  });

  describe('code is immutable here', () => {
    it('preserves the existing code through a name/active edit', async () => {
      const original = await seed({ code: 'MATH' });
      const updated = await useCase.execute(updateInput(original.id, { name: { fr: 'Physique', ar: 'فيزياء' } }));
      expect(updated.code).toBe('MATH');
    });
  });

  describe('no-op', () => {
    it('does not bump updatedAt or persist a delta when nothing changed', async () => {
      const original = await seed();

      const result = await useCase.execute(
        updateInput(original.id, { name: original.name, active: original.active }),
      );

      // applyWrite returns the row untouched — same updatedAt/updatedBy as creation.
      expect(result.updatedAt).toEqual(original.updatedAt);
      expect(result.updatedBy).toBe(original.updatedBy);
      expect(await subjects.findById(original.id)).toEqual(original);
    });
  });

  describe('not found', () => {
    it('throws SubjectNotFoundError for an unknown id', async () => {
      await expect(
        useCase.execute(updateInput('sub_00000000000000000000000404' as SubjectId)),
      ).rejects.toBeInstanceOf(SubjectNotFoundError);
    });

    it('throws SubjectNotFoundError for a soft-deleted id', async () => {
      const original = await seed();
      await subjects.softDelete(original.id, new Date(EDITED_AT), USER);
      await expect(useCase.execute(updateInput(original.id))).rejects.toBeInstanceOf(SubjectNotFoundError);
    });

    it('treats a foreign-center subject as not found (tenant scope)', async () => {
      const original = await seed();
      await expect(
        useCase.execute(updateInput(original.id, { centerCode: 'CS-RABAT-002' as CenterCode })),
      ).rejects.toBeInstanceOf(SubjectNotFoundError);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.subjects', async () => {
      const original = await seed();
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      useCase = new UpdateSubject(subjects, fakeClock(EDITED_AT), new PlanPolicy(planWithout));

      await expect(useCase.execute(updateInput(original.id))).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
    });
  });

  describe('validation', () => {
    it('rejects a blank French name', async () => {
      const original = await seed();
      await expect(
        useCase.execute(updateInput(original.id, { name: { fr: '   ', ar: 'فيزياء' } })),
      ).rejects.toThrow();
    });
  });
});
