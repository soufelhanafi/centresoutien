import { describe, it, expect, beforeEach } from 'vitest';
import { CreateGroup, type CreateGroupInput } from '../../../src/use-cases/create-group';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { GroupSubjectUnavailableError } from '../../../src/errors/group-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { Subject, SubjectId } from '../../../src/entities/subject';
import { InMemoryGroupRepository } from '../fakes/in-memory-group-repository';
import { InMemorySubjectRepository } from '../fakes/in-memory-subject-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import { planWithoutFeature } from '../fakes/plans';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const SUBJECT_ID = 'sub_00000000000000000000000001' as SubjectId;

const envelopeClock = fakeClock('2026-01-01T00:00:00Z');

function makeSubject(overrides: Partial<Subject> = {}): Subject {
  return {
    id: SUBJECT_ID,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    name: { fr: 'Maths', ar: 'الرياضيات' },
    active: true,
    ...overrides,
  };
}

function validInput(overrides: Partial<CreateGroupInput> = {}): CreateGroupInput {
  return {
    subjectId: SUBJECT_ID,
    teacherId: null,
    level: '  2ème Bac ',
    capacity: 15,
    kind: 'regular',
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

describe('CreateGroup', () => {
  let groups: InMemoryGroupRepository;
  let subjects: InMemorySubjectRepository;

  function build(plan: Plan): CreateGroup {
    return new CreateGroup(
      groups,
      subjects,
      fakeClock('2026-07-31T10:00:00Z'),
      fakeIds(),
      new PlanPolicy(plan),
    );
  }

  beforeEach(async () => {
    groups = new InMemoryGroupRepository();
    subjects = new InMemorySubjectRepository();
    await subjects.save(makeSubject());
  });

  describe('happy path', () => {
    it('creates an active regular group with a prefixed id, trimmed level, and a fresh envelope', async () => {
      const group = await build(PLANS.essentiel).execute(validInput());

      expect(group.id).toMatch(/^grp_/);
      expect(group.subjectId).toBe(SUBJECT_ID);
      expect(group.teacherId).toBeNull();
      expect(group.level).toBe('2ème Bac');
      expect(group.capacity).toBe(15);
      expect(group.kind).toBe('regular');
      expect(group.active).toBe(true);
      expect(group.centerCode).toBe(CENTER);
      expect(group.deviceOrigin).toBe(DEVICE);
      expect(group.updatedBy).toBe(USER);
      expect(group.createdAt).toEqual(new Date('2026-07-31T10:00:00Z'));
      expect(group.updatedAt).toEqual(group.createdAt);
      expect(group.deletedAt).toBeNull();
      expect(group.version).toBe(0);
    });

    it('persists the group so it can be read back by id', async () => {
      const group = await build(PLANS.essentiel).execute(validInput());
      expect(await groups.findById(group.id)).toEqual(group);
    });

    it('keeps an assigned teacher id', async () => {
      const teacherId = 'tch_00000000000000000000000009';
      const group = await build(PLANS.essentiel).execute(validInput({ teacherId }));
      expect(group.teacherId).toBe(teacherId);
    });
  });

  describe('exam-prep gating', () => {
    it('creates an exam-prep group on Pro', async () => {
      const group = await build(PLANS.pro).execute(validInput({ kind: 'exam-prep' }));
      expect(group.kind).toBe('exam-prep');
    });

    it('rejects an exam-prep group when the plan lacks core.exam-prep', async () => {
      await expect(
        build(planWithoutFeature('core.exam-prep')).execute(validInput({ kind: 'exam-prep' })),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
      expect(groups.all()).toHaveLength(0);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks core.groups', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      await expect(build(planWithout).execute(validInput())).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
      expect(groups.all()).toHaveLength(0);
    });
  });

  describe('capacity validation', () => {
    it('rejects a capacity below 1 (schema invariant)', async () => {
      await expect(build(PLANS.essentiel).execute(validInput({ capacity: 0 }))).rejects.toThrow();
      expect(groups.all()).toHaveLength(0);
    });

    it('rejects a non-integer capacity', async () => {
      await expect(build(PLANS.essentiel).execute(validInput({ capacity: 1.5 }))).rejects.toThrow();
      expect(groups.all()).toHaveLength(0);
    });
  });

  describe('subject resolution', () => {
    it('rejects an unknown subject as not-found', async () => {
      const input = validInput({ subjectId: 'sub_00000000000000000000000099' as SubjectId });
      const error = await build(PLANS.essentiel).execute(input).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(GroupSubjectUnavailableError);
      expect((error as GroupSubjectUnavailableError).reason).toBe('not-found');
      expect(groups.all()).toHaveLength(0);
    });

    it('rejects an inactive subject as inactive', async () => {
      await subjects.save(makeSubject({ active: false }));
      const error = await build(PLANS.essentiel).execute(validInput()).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(GroupSubjectUnavailableError);
      expect((error as GroupSubjectUnavailableError).reason).toBe('inactive');
      expect(groups.all()).toHaveLength(0);
    });

    it('rejects a subject that belongs to another center (tenant scoping)', async () => {
      const otherSubjectId = 'sub_00000000000000000000000003' as SubjectId;
      await subjects.save(makeSubject({ id: otherSubjectId, centerCode: OTHER_CENTER }));
      const error = await build(PLANS.essentiel)
        .execute(validInput({ subjectId: otherSubjectId }))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(GroupSubjectUnavailableError);
      expect((error as GroupSubjectUnavailableError).reason).toBe('not-found');
      expect(groups.all()).toHaveLength(0);
    });
  });

  describe('validation', () => {
    it('rejects a blank level', async () => {
      await expect(build(PLANS.essentiel).execute(validInput({ level: '   ' }))).rejects.toThrow();
      expect(groups.all()).toHaveLength(0);
    });

    it('rejects an invalid kind', async () => {
      const input = validInput({ kind: 'bootcamp' as CreateGroupInput['kind'] });
      await expect(build(PLANS.essentiel).execute(input)).rejects.toThrow();
      expect(groups.all()).toHaveLength(0);
    });

    it('rejects a malformed subject id', async () => {
      const input = validInput({ subjectId: 'not-an-id' as SubjectId });
      await expect(build(PLANS.essentiel).execute(input)).rejects.toThrow();
      expect(groups.all()).toHaveLength(0);
    });
  });
});
