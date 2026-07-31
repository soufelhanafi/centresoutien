import { describe, it, expect, beforeEach } from 'vitest';
import { CreateSubject, type CreateSubjectInput } from '../../../src/use-cases/create-subject';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { DuplicateSubjectCodeError } from '../../../src/errors/subject-errors';
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

    it('defaults code to null when none is supplied', async () => {
      const subject = await useCase.execute(validInput());
      expect(subject.code).toBeNull();
    });

    it('persists the subject so it can be read back by id', async () => {
      const subject = await useCase.execute(validInput());
      expect(await subjects.findById(subject.id)).toEqual(subject);
    });
  });

  describe('code', () => {
    it('normalizes a supplied code (trim + uppercase) and stores it', async () => {
      const subject = await useCase.execute(validInput({ code: '  math-1 ' }));
      expect(subject.code).toBe('MATH-1');
    });

    it('treats a blank/whitespace code as no code (null)', async () => {
      const subject = await useCase.execute(validInput({ code: '   ' }));
      expect(subject.code).toBeNull();
    });

    it('rejects a second live subject with the same code in the same center', async () => {
      await useCase.execute(validInput({ code: 'MATH' }));

      await expect(
        useCase.execute(validInput({ code: 'math', name: { fr: 'Maths sup', ar: 'رياضيات' } })),
      ).rejects.toBeInstanceOf(DuplicateSubjectCodeError);
      expect(subjects.all()).toHaveLength(1);
    });

    it('allows the same code in a different center (per-center uniqueness)', async () => {
      await useCase.execute(validInput({ code: 'MATH' }));
      const other = await useCase.execute(
        validInput({ code: 'MATH', centerCode: 'CS-RABAT-002' as CenterCode }),
      );
      expect(other.code).toBe('MATH');
      expect(subjects.all()).toHaveLength(2);
    });

    it('allows reusing a code freed by archiving (tombstones do not clash)', async () => {
      const first = await useCase.execute(validInput({ code: 'MATH' }));
      await subjects.softDelete(first.id, new Date('2026-07-30T09:00:00Z'), USER);

      const second = await useCase.execute(validInput({ code: 'MATH' }));
      expect(second.id).not.toBe(first.id);
      expect(second.code).toBe('MATH');
    });

    it('allows any number of subjects with no code', async () => {
      await useCase.execute(validInput());
      await useCase.execute(validInput({ name: { fr: 'Physique', ar: 'فيزياء' } }));
      expect(subjects.all()).toHaveLength(2);
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

    it('rejects a code with an illegal character', async () => {
      await expect(useCase.execute(validInput({ code: 'MA TH' }))).rejects.toThrow();
    });

    it('persists nothing when validation fails', async () => {
      await expect(
        useCase.execute(validInput({ name: { fr: '', ar: '' } })),
      ).rejects.toThrow();
      expect(subjects.all()).toHaveLength(0);
    });
  });
});
