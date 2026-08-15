import { describe, it, expect, beforeEach } from 'vitest';
import { UpdateNiveau, type UpdateNiveauInput } from '../../../src/use-cases/update-niveau';
import { CreateNiveau } from '../../../src/use-cases/create-niveau';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import {
  NiveauNotFoundError,
  DuplicateNiveauCodeError,
} from '../../../src/errors/niveau-errors';
import type { Niveau, NiveauId } from '../../../src/entities/niveau';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryNiveauRepository } from '../fakes/in-memory-niveau-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const EDITOR = 'usr_00000000000000000000000002' as UserId;

const CREATED_AT = '2026-07-29T10:00:00Z';
const EDITED_AT = '2026-07-30T12:00:00Z';

function updateInput(id: NiveauId, overrides: Partial<UpdateNiveauInput> = {}): UpdateNiveauInput {
  return {
    id,
    centerCode: CENTER,
    updatedBy: EDITOR,
    name: { fr: '2ème Bac SVT', ar: 'الثانية باكالوريا علوم الحياة والأرض' },
    category: 'lycee',
    active: true,
    ...overrides,
  };
}

describe('UpdateNiveau', () => {
  let niveaux: InMemoryNiveauRepository;
  let useCase: UpdateNiveau;
  const ids = fakeIds();

  async function seed(overrides: { code?: string; category?: Niveau['category'] } = {}): Promise<Niveau> {
    const create = new CreateNiveau(
      niveaux,
      fakeClock(CREATED_AT),
      ids,
      new PlanPolicy(PLANS.essentiel),
    );
    return create.execute({
      name: { fr: '1ère Année Primaire', ar: 'السنة الأولى ابتدائي' },
      code: overrides.code,
      category: overrides.category ?? 'primaire',
      centerCode: CENTER,
      deviceOrigin: DEVICE,
      updatedBy: USER,
    });
  }

  beforeEach(() => {
    niveaux = new InMemoryNiveauRepository();
    useCase = new UpdateNiveau(niveaux, fakeClock(EDITED_AT), new PlanPolicy(PLANS.essentiel));
  });

  describe('happy path', () => {
    it('renames the niveau and stamps updatedAt/updatedBy without touching identity', async () => {
      const original = await seed();

      const updated = await useCase.execute(
        updateInput(original.id, { name: { fr: '2ème Bac SVT', ar: 'الثانية باكالوريا علوم الحياة والأرض' } }),
      );

      expect(updated.name).toEqual({ fr: '2ème Bac SVT', ar: 'الثانية باكالوريا علوم الحياة والأرض' });
      expect(updated.id).toBe(original.id);
      expect(updated.centerCode).toBe(CENTER);
      expect(updated.deviceOrigin).toBe(original.deviceOrigin);
      expect(updated.createdAt).toEqual(original.createdAt);
      expect(updated.version).toBe(original.version);
      expect(updated.updatedBy).toBe(EDITOR);
      expect(updated.updatedAt).toEqual(new Date(EDITED_AT));
      expect(await niveaux.findById(original.id)).toEqual(updated);
    });

    it('changes the category', async () => {
      const original = await seed();
      const updated = await useCase.execute(updateInput(original.id, { category: 'college' }));
      expect(updated.category).toBe('college');
    });

    it('changes the code and stamps the write', async () => {
      const original = await seed();
      const updated = await useCase.execute(updateInput(original.id, { code: ' 2bac-svt ' }));
      expect(updated.code).toBe('2BAC-SVT');
      expect(updated.updatedAt).toEqual(new Date(EDITED_AT));
    });

    it('deactivates an active niveau (active → false)', async () => {
      const original = await seed();
      const updated = await useCase.execute(
        updateInput(original.id, { name: original.name, category: original.category, active: false }),
      );
      expect(updated.active).toBe(false);
    });

    it('reactivates a deactivated niveau (active → true)', async () => {
      const original = await seed();
      await useCase.execute(
        updateInput(original.id, { name: original.name, category: original.category, active: false }),
      );

      const reactivated = await useCase.execute(
        updateInput(original.id, { name: original.name, category: original.category, active: true }),
      );
      expect(reactivated.active).toBe(true);
    });

    it('trims the incoming name before saving', async () => {
      const original = await seed();
      const updated = await useCase.execute(
        updateInput(original.id, { name: { fr: '  1AC ', ar: ' الأولى إعدادي ' } }),
      );
      expect(updated.name).toEqual({ fr: '1AC', ar: 'الأولى إعدادي' });
    });
  });

  describe('code uniqueness (editable here, unlike Subject.code)', () => {
    it('rejects a code owned by another live niveau', async () => {
      const first = await seed({ code: '1AP' });
      await seed({ code: '2AP' });

      await expect(
        useCase.execute(updateInput(first.id, { code: '2AP' })),
      ).rejects.toBeInstanceOf(DuplicateNiveauCodeError);
    });

    it('allows keeping the niveau’s own code (self-reference is not a clash)', async () => {
      const original = await seed({ code: '1AP' });
      const updated = await useCase.execute(updateInput(original.id, { code: '1AP' }));
      expect(updated.code).toBe('1AP');
    });

    it('allows moving to a code freed by archiving', async () => {
      const first = await seed({ code: '1AP' });
      const second = await seed({ code: '2AP' });
      await niveaux.softDelete(second.id, new Date(EDITED_AT), USER);

      const updated = await useCase.execute(updateInput(first.id, { code: '2AP' }));
      expect(updated.code).toBe('2AP');
    });

    it('clears a code to null without tripping the guard', async () => {
      const original = await seed({ code: '1AP' });
      const updated = await useCase.execute(updateInput(original.id, { code: '   ' }));
      expect(updated.code).toBeNull();
    });
  });

  describe('no-op', () => {
    it('does not bump updatedAt or persist a delta when nothing changed', async () => {
      const original = await seed();

      const result = await useCase.execute(
        updateInput(original.id, {
          name: original.name,
          category: original.category,
          active: original.active,
          code: original.code ?? undefined,
        }),
      );

      expect(result.updatedAt).toEqual(original.updatedAt);
      expect(result.updatedBy).toBe(original.updatedBy);
      expect(await niveaux.findById(original.id)).toEqual(original);
    });
  });

  describe('not found', () => {
    it('throws NiveauNotFoundError for an unknown id', async () => {
      await expect(
        useCase.execute(updateInput('niv_00000000000000000000000404' as NiveauId)),
      ).rejects.toBeInstanceOf(NiveauNotFoundError);
    });

    it('throws NiveauNotFoundError for a soft-deleted id', async () => {
      const original = await seed();
      await niveaux.softDelete(original.id, new Date(EDITED_AT), USER);
      await expect(useCase.execute(updateInput(original.id))).rejects.toBeInstanceOf(NiveauNotFoundError);
    });

    it('treats a foreign-center niveau as not found (tenant scope)', async () => {
      const original = await seed();
      await expect(
        useCase.execute(updateInput(original.id, { centerCode: 'CS-RABAT-002' as CenterCode })),
      ).rejects.toBeInstanceOf(NiveauNotFoundError);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.niveaux', async () => {
      const original = await seed();
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      useCase = new UpdateNiveau(niveaux, fakeClock(EDITED_AT), new PlanPolicy(planWithout));

      await expect(useCase.execute(updateInput(original.id))).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
    });
  });

  describe('validation', () => {
    it('rejects a blank French name', async () => {
      const original = await seed();
      await expect(
        useCase.execute(updateInput(original.id, { name: { fr: '   ', ar: 'مستوى' } })),
      ).rejects.toThrow();
    });
  });
});
