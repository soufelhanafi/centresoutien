import { describe, it, expect, beforeEach } from 'vitest';
import { MergeParents, type MergeParentsInput } from '../../../src/use-cases/merge-parents';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { ParentNotFoundError } from '../../../src/errors/people-errors';
import { MergeSameEntityError } from '../../../src/errors/merge-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Parent, ParentId } from '../../../src/entities/parent';
import type { Student, StudentId } from '../../../src/entities/student';
import type { PhoneNumber } from '../../../src/value-objects/phone-number';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { InMemoryParentRepository } from '../fakes/in-memory-parent-repository';
import { InMemoryStudentRepository } from '../fakes/in-memory-student-repository';
import { InMemoryMergeLogRepository } from '../fakes/in-memory-merge-log-repository';
import { InMemoryMergeParentsUnitOfWork } from '../fakes/in-memory-merge-parents-unit-of-work';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import { planWithoutFeature } from '../fakes/plans';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const WINNER = 'prt_0000000000000000000000000A' as ParentId;
const LOSER = 'prt_0000000000000000000000000B' as ParentId;
const STUDENT_ONE = 'stu_0000000000000000000000000C' as StudentId;
const STUDENT_TWO = 'stu_0000000000000000000000000D' as StudentId;

const clock = fakeClock('2026-07-28T10:00:00Z');

function makeParent(id: ParentId, overrides: Partial<Parent> = {}): Parent {
  return {
    id,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock),
    naturalKey: `${CENTER}::mohamed-elamrani::+212600000000`,
    name: 'Mohamed El Amrani',
    phone: '+212600000000' as PhoneNumber,
    email: null,
    relation: 'father',
    whatsappOptIn: false,
    ...overrides,
  };
}

function makeStudent(id: StudentId, guardianIds: ParentId[], overrides: Partial<Student> = {}): Student {
  return {
    id,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock),
    naturalKey: `${CENTER}::yassine-alaoui::2009-05-01`,
    name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    birthDate: '2009-05-01',
    level: '2 Bac SM',
    school: null,
    notes: null,
    guardianIds,
    ...overrides,
  };
}

function validInput(overrides: Partial<MergeParentsInput> = {}): MergeParentsInput {
  return {
    winnerId: WINNER,
    loserId: LOSER,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...overrides,
  };
}

describe('MergeParents', () => {
  let parents: InMemoryParentRepository;
  let students: InMemoryStudentRepository;
  let mergeLogs: InMemoryMergeLogRepository;
  let unitOfWork: InMemoryMergeParentsUnitOfWork;
  let useCase: MergeParents;

  function setup(failAfterWrites = false): void {
    parents = new InMemoryParentRepository();
    students = new InMemoryStudentRepository();
    mergeLogs = new InMemoryMergeLogRepository();
    unitOfWork = new InMemoryMergeParentsUnitOfWork(parents, students, mergeLogs, failAfterWrites);
    useCase = new MergeParents(parents, students, clock, fakeIds(), new PlanPolicy(PLANS.premium), unitOfWork);
  }

  beforeEach(() => {
    setup();
  });

  describe('happy path', () => {
    it('tombstones the loser with mergedIntoId, re-points students, records the merge log', async () => {
      await parents.save(makeParent(WINNER, { email: 'winner@mail.ma' }));
      await parents.save(makeParent(LOSER, { email: 'loser@mail.ma' }));
      const linkedOne = makeStudent(STUDENT_ONE, [LOSER]);
      const linkedTwo = makeStudent(STUDENT_TWO, [LOSER, WINNER]);
      const unrelated = makeStudent('stu_0000000000000000000000000E' as StudentId, []);
      await students.save(linkedOne);
      await students.save(linkedTwo);
      await students.save(unrelated);

      const result = await useCase.execute(validInput());

      expect(result.id).toBe(WINNER);
      expect(result.deletedAt).toBeNull();
      expect(result.email).toBe('winner@mail.ma');

      const tombstoned = parents.all().find((p) => p.id === LOSER);
      expect(tombstoned).toBeDefined();
      expect(tombstoned?.deletedAt).toEqual(new Date('2026-07-28T10:00:00Z'));
      expect(tombstoned?.mergedIntoId).toBe(WINNER);
      expect(tombstoned?.updatedBy).toBe(USER);

      const repointedOne = students.all().find((s) => s.id === STUDENT_ONE);
      expect(repointedOne?.guardianIds).toEqual([WINNER]);
      // Duplicate-proof: a student already linked to the winner ends with a single winner entry.
      const repointedTwo = students.all().find((s) => s.id === STUDENT_TWO);
      expect(repointedTwo?.guardianIds).toEqual([WINNER]);
      const untouched = students.all().find((s) => s.id === 'stu_0000000000000000000000000E');
      expect(untouched?.guardianIds).toEqual([]);

      const logs = mergeLogs.all();
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        entityType: 'parents',
        loserId: LOSER,
        winnerId: WINNER,
        reason: 'manual',
      });
      expect(logs[0]?.deletedAt).toBeNull();
    });

    it('absorbs the loser email only when the winner lacks one, and never overwrites winner values', async () => {
      await parents.save(makeParent(WINNER, { email: null }));
      await parents.save(makeParent(LOSER, { email: 'loser@mail.ma' }));
      await useCase.execute(validInput());
      const savedWinner = parents.all().find((p) => p.id === WINNER);
      expect(savedWinner?.email).toBe('loser@mail.ma');
      expect(savedWinner?.name).toBe('Mohamed El Amrani');
      expect(savedWinner?.phone).toBe('+212600000000');
    });

    it('keeps the winner email when it already has one', async () => {
      await parents.save(makeParent(WINNER, { email: 'winner@mail.ma' }));
      await parents.save(makeParent(LOSER, { email: 'loser@mail.ma' }));
      await useCase.execute(validInput());
      const savedWinner = parents.all().find((p) => p.id === WINNER);
      expect(savedWinner?.email).toBe('winner@mail.ma');
    });

    it('records the duplicate-detection reason when the sync engine drives the merge', async () => {
      await parents.save(makeParent(WINNER));
      await parents.save(makeParent(LOSER));
      await useCase.execute(validInput({ reason: 'same-name-phone' }));
      expect(mergeLogs.all()[0]?.reason).toBe('same-name-phone');
    });

    it('calls the unit of work exactly once — one atomic commit, not N independent repo awaits', async () => {
      await parents.save(makeParent(WINNER));
      await parents.save(makeParent(LOSER));
      await students.save(makeStudent(STUDENT_ONE, [LOSER]));
      await useCase.execute(validInput());
      expect(unitOfWork.commits).toBe(1);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when the plan lacks sync.conflict-resolution', async () => {
      useCase = new MergeParents(
        parents,
        students,
        clock,
        fakeIds(),
        new PlanPolicy(planWithoutFeature('sync.conflict-resolution')),
        unitOfWork,
      );
      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });
  });

  describe('guards', () => {
    it('rejects a self-merge (winnerId === loserId)', async () => {
      await expect(useCase.execute(validInput({ loserId: WINNER }))).rejects.toBeInstanceOf(
        MergeSameEntityError,
      );
    });

    it('rejects an unknown or archived winner', async () => {
      await parents.save(makeParent(LOSER));
      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(ParentNotFoundError);

      const archived = makeParent(WINNER, { deletedAt: new Date('2026-07-01T00:00:00Z') });
      await parents.save(archived);
      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(ParentNotFoundError);
    });

    it('rejects an unknown or archived loser', async () => {
      await parents.save(makeParent(WINNER));
      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(ParentNotFoundError);

      await parents.save(makeParent(LOSER, { deletedAt: new Date('2026-07-01T00:00:00Z') }));
      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(ParentNotFoundError);
    });

    it('rejects a cross-center merge — a foreign-tenant id reads as not found', async () => {
      await parents.save(makeParent(WINNER, { centerCode: OTHER_CENTER }));
      await parents.save(makeParent(LOSER));
      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(ParentNotFoundError);
    });
  });

  describe('atomicity (SOU-169)', () => {
    it('rolls back the whole merge when a dependent re-point write fails', async () => {
      setup(true);
      const winnerBefore = makeParent(WINNER, { email: 'winner@mail.ma' });
      const loserBefore = makeParent(LOSER, { email: 'loser@mail.ma' });
      const studentBefore = makeStudent(STUDENT_ONE, [LOSER]);
      await parents.save(winnerBefore);
      await parents.save(loserBefore);
      await students.save(studentBefore);

      await expect(useCase.execute(validInput())).rejects.toThrow('simulated dependent re-point failure');

      // Nothing applied: winner unchanged, loser alive, student still on loser, no log.
      expect(parents.all().find((p) => p.id === WINNER)).toEqual(winnerBefore);
      expect(parents.all().find((p) => p.id === LOSER)).toEqual(loserBefore);
      expect(parents.all().find((p) => p.id === LOSER)?.deletedAt).toBeNull();
      expect(students.all().find((s) => s.id === STUDENT_ONE)).toEqual(studentBefore);
      expect(mergeLogs.all()).toHaveLength(0);
      expect(unitOfWork.commits).toBe(1);
    });
  });
});
