import { describe, it, expect, beforeEach } from 'vitest';
import { CreateNiveau, type CreateNiveauInput } from '../../../src/use-cases/create-niveau';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { DuplicateNiveauCodeError } from '../../../src/errors/niveau-errors';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryNiveauRepository } from '../fakes/in-memory-niveau-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;

function validInput(overrides: Partial<CreateNiveauInput> = {}): CreateNiveauInput {
  return {
    name: { fr: '  2ème Bac SVT ', ar: ' الثانية باكالوريا علوم الحياة والأرض ' },
    category: 'lycee',
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

describe('CreateNiveau', () => {
  let niveaux: InMemoryNiveauRepository;
  let useCase: CreateNiveau;

  beforeEach(() => {
    niveaux = new InMemoryNiveauRepository();
    useCase = new CreateNiveau(
      niveaux,
      fakeClock('2026-07-29T10:00:00Z'),
      fakeIds(),
      new PlanPolicy(PLANS.essentiel),
    );
  });

  describe('happy path', () => {
    it('creates an active niveau with a prefixed id, trimmed name, category, and a fresh envelope', async () => {
      const niveau = await useCase.execute(validInput());

      expect(niveau.id).toMatch(/^niv_/);
      expect(niveau.name).toEqual({
        fr: '2ème Bac SVT',
        ar: 'الثانية باكالوريا علوم الحياة والأرض',
      });
      expect(niveau.category).toBe('lycee');
      expect(niveau.active).toBe(true);
      expect(niveau.centerCode).toBe(CENTER);
      expect(niveau.deviceOrigin).toBe(DEVICE);
      expect(niveau.updatedBy).toBe(USER);
      expect(niveau.createdAt).toEqual(new Date('2026-07-29T10:00:00Z'));
      expect(niveau.updatedAt).toEqual(niveau.createdAt);
      expect(niveau.deletedAt).toBeNull();
      expect(niveau.version).toBe(0);
    });

    it('defaults code to null when none is supplied', async () => {
      const niveau = await useCase.execute(validInput());
      expect(niveau.code).toBeNull();
    });

    it('persists the niveau so it can be read back by id', async () => {
      const niveau = await useCase.execute(validInput());
      expect(await niveaux.findById(niveau.id)).toEqual(niveau);
    });

    it('accepts every category', async () => {
      for (const category of ['primaire', 'college', 'lycee'] as const) {
        const niveau = await useCase.execute(
          validInput({ category, name: { fr: 'Niveau', ar: 'مستوى' } }),
        );
        expect(niveau.category).toBe(category);
      }
    });
  });

  describe('code', () => {
    it('normalizes a supplied code (trim + uppercase) and stores it', async () => {
      const niveau = await useCase.execute(validInput({ code: '  2bac-svt ' }));
      expect(niveau.code).toBe('2BAC-SVT');
    });

    it('treats a blank/whitespace code as no code (null)', async () => {
      const niveau = await useCase.execute(validInput({ code: '   ' }));
      expect(niveau.code).toBeNull();
    });

    it('rejects a second live niveau with the same code in the same center', async () => {
      await useCase.execute(validInput({ code: '1AP' }));

      await expect(
        useCase.execute(validInput({ code: '1ap', name: { fr: 'Année sup', ar: 'مستوى' } })),
      ).rejects.toBeInstanceOf(DuplicateNiveauCodeError);
      expect(niveaux.all()).toHaveLength(1);
    });

    it('allows the same code in a different center (per-center uniqueness)', async () => {
      await useCase.execute(validInput({ code: '1AP' }));
      const other = await useCase.execute(
        validInput({ code: '1AP', centerCode: 'CS-RABAT-002' as CenterCode }),
      );
      expect(other.code).toBe('1AP');
      expect(niveaux.all()).toHaveLength(2);
    });

    it('allows reusing a code freed by archiving (tombstones do not clash)', async () => {
      const first = await useCase.execute(validInput({ code: '1AP' }));
      await niveaux.softDelete(first.id, new Date('2026-07-30T09:00:00Z'), USER);

      const second = await useCase.execute(validInput({ code: '1AP' }));
      expect(second.id).not.toBe(first.id);
      expect(second.code).toBe('1AP');
    });

    it('allows any number of niveaux with no code', async () => {
      await useCase.execute(validInput());
      await useCase.execute(validInput({ name: { fr: 'Physique', ar: 'فيزياء' } }));
      expect(niveaux.all()).toHaveLength(2);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.niveaux', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      useCase = new CreateNiveau(niveaux, fakeClock(), fakeIds(), new PlanPolicy(planWithout));

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(niveaux.all()).toHaveLength(0);
    });
  });

  describe('validation', () => {
    it('rejects a blank French name', async () => {
      await expect(
        useCase.execute(validInput({ name: { fr: '   ', ar: 'مستوى' } })),
      ).rejects.toThrow();
    });

    it('rejects an unknown category', async () => {
      await expect(
        useCase.execute(validInput({ category: 'university' as CreateNiveauInput['category'] })),
      ).rejects.toThrow();
    });

    it('rejects a code with an illegal character', async () => {
      await expect(useCase.execute(validInput({ code: '2 BAC' }))).rejects.toThrow();
    });

    it('persists nothing when validation fails', async () => {
      await expect(
        useCase.execute(validInput({ name: { fr: '', ar: '' } })),
      ).rejects.toThrow();
      expect(niveaux.all()).toHaveLength(0);
    });
  });
});
