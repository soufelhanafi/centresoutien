import { describe, it, expect, beforeEach } from 'vitest';
import { CreateSubject, type CreateSubjectInput } from '../../../src/use-cases/create-subject';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemorySubjectRepository } from '../fakes/in-memory-subject-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

function validInput(overrides: Partial<CreateSubjectInput> = {}): CreateSubjectInput {
  return {
    name: { fr: '  Mathématiques ', ar: ' الرياضيات ' },
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

describe('CreateSubject', () => {
  let subjects: InMemorySubjectRepository;
  let useCase: CreateSubject;

  beforeEach(() => {
    subjects = new InMemorySubjectRepository();
    useCase = new CreateSubject(
      subjects,
      fakeClock('2026-07-29T10:00:00Z'),
      fakeIds(),
      new PlanPolicy(PLANS.essentiel),
    );
  });

  describe('happy path', () => {
    it('creates an active subject with a prefixed id, trimmed name, and a fresh envelope', async () => {
      const subject = await useCase.execute(validInput());

      expect(subject.id).toMatch(/^sub_/);
      expect(subject.name).toEqual({ fr: 'Mathématiques', ar: 'الرياضيات' });
      expect(subject.active).toBe(true);
      expect(subject.centerCode).toBe(CENTER);
      expect(subject.deviceOrigin).toBe(DEVICE);
      expect(subject.updatedBy).toBe(USER);
      expect(subject.createdAt).toEqual(new Date('2026-07-29T10:00:00Z'));
      expect(subject.updatedAt).toEqual(subject.createdAt);
      expect(subject.deletedAt).toBeNull();
      expect(subject.version).toBe(0);
    });

    it('persists the subject so it can be read back by id', async () => {
      const subject = await useCase.execute(validInput());
      expect(await subjects.findById(subject.id)).toEqual(subject);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.subjects', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      useCase = new CreateSubject(subjects, fakeClock(), fakeIds(), new PlanPolicy(planWithout));

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(subjects.all()).toHaveLength(0);
    });
  });

  describe('validation', () => {
    it('rejects a blank French name', async () => {
      await expect(
        useCase.execute(validInput({ name: { fr: '   ', ar: 'الرياضيات' } })),
      ).rejects.toThrow();
    });

    it('persists nothing when validation fails', async () => {
      await expect(
        useCase.execute(validInput({ name: { fr: '', ar: '' } })),
      ).rejects.toThrow();
      expect(subjects.all()).toHaveLength(0);
    });
  });
});
