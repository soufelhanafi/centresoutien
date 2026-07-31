import { describe, it, expect, beforeEach } from 'vitest';
import { ArchiveSubject } from '../../../src/use-cases/archive-subject';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { SubjectInUseError, SubjectNotFoundError } from '../../../src/errors/subject-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Subject, SubjectId } from '../../../src/entities/subject';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemorySubjectRepository } from '../fakes/in-memory-subject-repository';
import { fakeSubjectReference } from '../fakes/fake-subject-reference';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const SUBJECT_ID = 'sub_00000000000000000000000001' as SubjectId;

function seededSubject(createdAt: string): Subject {
  return {
    id: SUBJECT_ID,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, fakeClock(createdAt)),
    name: { fr: 'Mathématiques', ar: 'الرياضيات' },
    code: 'MATH',
    active: true,
  };
}

describe('ArchiveSubject', () => {
  let subjects: InMemorySubjectRepository;

  beforeEach(async () => {
    subjects = new InMemorySubjectRepository();
    await subjects.save(seededSubject('2026-07-29T10:00:00Z'));
  });

  describe('happy path', () => {
    it('soft-deletes a subject that nothing references', async () => {
      const useCase = new ArchiveSubject(
        subjects,
        fakeSubjectReference(),
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );

      await useCase.execute({ centerCode: CENTER, subjectId: SUBJECT_ID, updatedBy: USER });

      // Tombstoned: excluded from default reads...
      expect(await subjects.findById(SUBJECT_ID)).toBeNull();
    });

    it('leaves a tombstone (deletedAt + who) visible to listChangedSince for sync', async () => {
      const useCase = new ArchiveSubject(
        subjects,
        fakeSubjectReference(),
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );

      await useCase.execute({ centerCode: CENTER, subjectId: SUBJECT_ID, updatedBy: USER });

      const changed = await subjects.listChangedSince(new Date('2026-07-30T00:00:00Z'));
      expect(changed).toHaveLength(1);
      expect(changed[0]?.id).toBe(SUBJECT_ID);
      expect(changed[0]?.deletedAt).toEqual(new Date('2026-07-30T09:00:00Z'));
      expect(changed[0]?.updatedBy).toBe(USER);
    });
  });

  describe('in-use guard', () => {
    it('throws SubjectInUseError when a group/session/formula references the subject', async () => {
      const useCase = new ArchiveSubject(
        subjects,
        fakeSubjectReference([SUBJECT_ID]),
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );

      await expect(
        useCase.execute({ centerCode: CENTER, subjectId: SUBJECT_ID, updatedBy: USER }),
      ).rejects.toBeInstanceOf(SubjectInUseError);
      // The subject is untouched — still alive.
      expect(await subjects.findById(SUBJECT_ID)).not.toBeNull();
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.subjects', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      const useCase = new ArchiveSubject(
        subjects,
        fakeSubjectReference(),
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(planWithout),
      );

      await expect(
        useCase.execute({ centerCode: CENTER, subjectId: SUBJECT_ID, updatedBy: USER }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(await subjects.findById(SUBJECT_ID)).not.toBeNull();
    });
  });

  describe('not found / tenant scoping', () => {
    it('throws SubjectNotFoundError for an unknown id and touches nothing', async () => {
      const useCase = new ArchiveSubject(
        subjects,
        fakeSubjectReference(),
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );
      const UNKNOWN = 'sub_00000000000000000000000099' as SubjectId;

      await expect(
        useCase.execute({ centerCode: CENTER, subjectId: UNKNOWN, updatedBy: USER }),
      ).rejects.toBeInstanceOf(SubjectNotFoundError);
      expect(await subjects.findById(SUBJECT_ID)).not.toBeNull();
    });

    it('throws SubjectNotFoundError for a subject in another center (no cross-tenant archive)', async () => {
      const useCase = new ArchiveSubject(
        subjects,
        fakeSubjectReference(),
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );
      const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;

      await expect(
        useCase.execute({ centerCode: OTHER_CENTER, subjectId: SUBJECT_ID, updatedBy: USER }),
      ).rejects.toBeInstanceOf(SubjectNotFoundError);
      expect(await subjects.findById(SUBJECT_ID)).not.toBeNull();
    });

    it('throws SubjectNotFoundError for an already-archived subject', async () => {
      await subjects.softDelete(SUBJECT_ID, new Date('2026-07-30T08:00:00Z'), USER);
      const useCase = new ArchiveSubject(
        subjects,
        fakeSubjectReference(),
        fakeClock('2026-07-30T09:00:00Z'),
        new PlanPolicy(PLANS.essentiel),
      );

      await expect(
        useCase.execute({ centerCode: CENTER, subjectId: SUBJECT_ID, updatedBy: USER }),
      ).rejects.toBeInstanceOf(SubjectNotFoundError);
    });
  });
});
