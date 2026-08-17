import { describe, it, expect, beforeEach } from 'vitest';
import { ArchiveNiveau } from '../../../src/use-cases/archive-niveau';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { NiveauInUseError, NiveauNotFoundError } from '../../../src/errors/niveau-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Niveau, NiveauId } from '../../../src/entities/niveau';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryNiveauRepository } from '../fakes/in-memory-niveau-repository';
import { fakeNiveauReference } from '../fakes/fake-niveau-reference';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const NIVEAU_ID = 'niv_00000000000000000000000001' as NiveauId;

function seededNiveau(createdAt: string): Niveau {
  return {
    id: NIVEAU_ID,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock(createdAt)),
    name: { fr: '2ème Bac SVT', ar: 'الثانية باكالوريا علوم الحياة والأرض' },
    code: '2BAC-SVT',
    category: 'lycee',
    active: true,
  };
}

describe('ArchiveNiveau', () => {
  let niveaux: InMemoryNiveauRepository;

  beforeEach(async () => {
    niveaux = new InMemoryNiveauRepository();
    await niveaux.save(seededNiveau('2026-07-29T10:00:00Z'));
  });

  describe('happy path', () => {
    it('soft-deletes a niveau that nothing references', async () => {
      const useCase = new ArchiveNiveau(
        niveaux,
        fakeNiveauReference(),
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );

      await useCase.execute({ centerCode: CENTER, niveauId: NIVEAU_ID, updatedBy: USER });

      // Tombstoned: excluded from default reads...
      expect(await niveaux.findById(NIVEAU_ID)).toBeNull();
    });

    it('leaves a tombstone (deletedAt + who) visible to listChangedSince for sync', async () => {
      const useCase = new ArchiveNiveau(
        niveaux,
        fakeNiveauReference(),
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );

      await useCase.execute({ centerCode: CENTER, niveauId: NIVEAU_ID, updatedBy: USER });

      const changed = await niveaux.listChangedSince(new Date('2026-07-30T00:00:00Z'));
      expect(changed).toHaveLength(1);
      expect(changed[0]?.id).toBe(NIVEAU_ID);
      expect(changed[0]?.deletedAt).toEqual(new Date('2026-07-30T09:00:00Z'));
      expect(changed[0]?.updatedBy).toBe(USER);
    });
  });

  describe('in-use guard', () => {
    it('throws NiveauInUseError when a student/group/teacher references the niveau', async () => {
      const useCase = new ArchiveNiveau(
        niveaux,
        fakeNiveauReference([NIVEAU_ID]),
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );

      await expect(
        useCase.execute({ centerCode: CENTER, niveauId: NIVEAU_ID, updatedBy: USER }),
      ).rejects.toBeInstanceOf(NiveauInUseError);
      // The niveau is untouched — still alive.
      expect(await niveaux.findById(NIVEAU_ID)).not.toBeNull();
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.niveaux', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      const useCase = new ArchiveNiveau(
        niveaux,
        fakeNiveauReference(),
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(planWithout),
      );

      await expect(
        useCase.execute({ centerCode: CENTER, niveauId: NIVEAU_ID, updatedBy: USER }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(await niveaux.findById(NIVEAU_ID)).not.toBeNull();
    });
  });

  describe('not found / tenant scoping', () => {
    it('throws NiveauNotFoundError for an unknown id and touches nothing', async () => {
      const useCase = new ArchiveNiveau(
        niveaux,
        fakeNiveauReference(),
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );
      const UNKNOWN = 'niv_00000000000000000000000099' as NiveauId;

      await expect(
        useCase.execute({ centerCode: CENTER, niveauId: UNKNOWN, updatedBy: USER }),
      ).rejects.toBeInstanceOf(NiveauNotFoundError);
      expect(await niveaux.findById(NIVEAU_ID)).not.toBeNull();
    });

    it('throws NiveauNotFoundError for a niveau in another center (no cross-tenant archive)', async () => {
      const useCase = new ArchiveNiveau(
        niveaux,
        fakeNiveauReference(),
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );
      const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;

      await expect(
        useCase.execute({ centerCode: OTHER_CENTER, niveauId: NIVEAU_ID, updatedBy: USER }),
      ).rejects.toBeInstanceOf(NiveauNotFoundError);
      expect(await niveaux.findById(NIVEAU_ID)).not.toBeNull();
    });

    it('throws NiveauNotFoundError for an already-archived niveau', async () => {
      await niveaux.softDelete(NIVEAU_ID, new Date('2026-07-30T08:00:00Z'), USER);
      const useCase = new ArchiveNiveau(
        niveaux,
        fakeNiveauReference(),
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );

      await expect(
        useCase.execute({ centerCode: CENTER, niveauId: NIVEAU_ID, updatedBy: USER }),
      ).rejects.toBeInstanceOf(NiveauNotFoundError);
    });
  });
});
