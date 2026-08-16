import { describe, it, expect, beforeEach } from 'vitest';
import { SaveTeacherAvailability } from '../../../src/use-cases/save-teacher-availability';
import { GetTeacherAvailability } from '../../../src/use-cases/get-teacher-availability';
import { SaveTeacherAvailabilityException } from '../../../src/use-cases/save-teacher-availability-exception';
import { ArchiveTeacherAvailabilityException } from '../../../src/use-cases/archive-teacher-availability-exception';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { TeacherNotFoundError } from '../../../src/errors/people-errors';
import { TeacherAvailabilityExceptionNotFoundError } from '../../../src/errors/teacher-availability-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Teacher, TeacherId } from '../../../src/entities/teacher';
import type { TeacherAvailabilityExceptionId } from '../../../src/entities/teacher-availability-exception';
import type { PhoneNumber } from '../../../src/value-objects/phone-number';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type { TeacherAvailabilityInput } from '../../../src/schemas/teacher-availability';
import { InMemoryTeacherRepository } from '../fakes/in-memory-teacher-repository';
import { InMemoryTeacherAvailabilityRepository } from '../fakes/in-memory-teacher-availability-repository';
import { InMemoryTeacherAvailabilityExceptionRepository } from '../fakes/in-memory-teacher-availability-exception-repository';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import { planWithoutFeature } from '../fakes/plans';
import { ZodError } from 'zod';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RBA-002' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const TEACHER_ID = 'tch_00000000000000000000000001' as TeacherId;

const envelopeClock = fakeClock('2026-07-29T10:00:00Z');

function makeTeacher(overrides: Partial<Teacher> = {}): Teacher {
  return {
    id: TEACHER_ID,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    naturalKey: `${CENTER}::yassine-alaoui::+212612345678`,
    name: { fr: 'Yassine Alaoui', ar: 'ياسين العلوي' },
    cin: null,
    phone: '+212612345678' as PhoneNumber,
    email: null,
    subjectIds: [],
    active: true,
    ...overrides,
  };
}

const closedWeek = (): TeacherAvailabilityInput['weeklyWindows'] => ({
  0: [],
  1: [],
  2: [],
  3: [],
  4: [],
  5: [],
  6: [],
});

function weekWithMonday(open: string, close: string): TeacherAvailabilityInput['weeklyWindows'] {
  return { ...closedWeek(), 1: [{ open, close }] };
}

describe('teacher availability use cases (SOU-259)', () => {
  let teachers: InMemoryTeacherRepository;
  let availability: InMemoryTeacherAvailabilityRepository;
  let exceptions: InMemoryTeacherAvailabilityExceptionRepository;
  let clock: ReturnType<typeof fakeClock>;

  const envelope = { centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER };

  beforeEach(async () => {
    teachers = new InMemoryTeacherRepository();
    availability = new InMemoryTeacherAvailabilityRepository();
    exceptions = new InMemoryTeacherAvailabilityExceptionRepository();
    clock = fakeClock('2026-08-15T10:00:00Z');
    await teachers.save(makeTeacher());
  });

  function saveAvailability(plan = PLANS.pro): SaveTeacherAvailability {
    return new SaveTeacherAvailability(availability, teachers, clock, fakeIds(), new PlanPolicy(plan));
  }

  function getAvailability(plan = PLANS.pro): GetTeacherAvailability {
    return new GetTeacherAvailability(availability, exceptions, new PlanPolicy(plan));
  }

  function saveException(plan = PLANS.pro): SaveTeacherAvailabilityException {
    return new SaveTeacherAvailabilityException(exceptions, teachers, clock, fakeIds(), new PlanPolicy(plan));
  }

  function archiveException(plan = PLANS.pro): ArchiveTeacherAvailabilityException {
    return new ArchiveTeacherAvailabilityException(exceptions, clock, new PlanPolicy(plan));
  }

  describe('SaveTeacherAvailability', () => {
    it('creates a fresh row with the tav_ prefix and a full envelope', async () => {
      const saved = await saveAvailability().execute({
        ...envelope,
        teacherId: TEACHER_ID,
        weeklyWindows: weekWithMonday('09:00', '12:00'),
      });

      expect(saved.id).toMatch(/^tav_/);
      expect(saved.teacherId).toBe(TEACHER_ID);
      expect(saved.weeklyWindows[1]).toEqual([{ open: '09:00', close: '12:00' }]);
      expect(saved.deletedAt).toBeNull();
      expect(saved.version).toBe(0);
      expect(await availability.findByTeacher(CENTER, TEACHER_ID)).toEqual(saved);
    });

    it('updates the existing row in place — never a second row per teacher', async () => {
      const first = await saveAvailability().execute({
        ...envelope,
        teacherId: TEACHER_ID,
        weeklyWindows: weekWithMonday('09:00', '12:00'),
      });
      clock.advance(60_000);
      const second = await saveAvailability().execute({
        ...envelope,
        teacherId: TEACHER_ID,
        weeklyWindows: weekWithMonday('14:00', '18:00'),
      });

      expect(second.id).toBe(first.id);
      expect(second.weeklyWindows[1]).toEqual([{ open: '14:00', close: '18:00' }]);
      expect(second.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
      expect(availability.all()).toHaveLength(1);
    });

    it('stays sync-quiet on a no-op re-save (invariant 5)', async () => {
      const first = await saveAvailability().execute({
        ...envelope,
        teacherId: TEACHER_ID,
        weeklyWindows: weekWithMonday('09:00', '12:00'),
      });
      clock.advance(60_000);
      const second = await saveAvailability().execute({
        ...envelope,
        teacherId: TEACHER_ID,
        weeklyWindows: weekWithMonday('09:00', '12:00'),
      });

      expect(second.updatedAt).toEqual(first.updatedAt);
    });

    it('rejects an unknown or foreign-center teacher', async () => {
      await teachers.save(makeTeacher({ centerCode: OTHER_CENTER }));
      await expect(
        saveAvailability().execute({
          ...envelope,
          teacherId: TEACHER_ID,
          weeklyWindows: closedWeek(),
        }),
      ).rejects.toBeInstanceOf(TeacherNotFoundError);
    });

    it('rejects overlapping windows with the stable windows-overlap code', async () => {
      await expect(
        saveAvailability().execute({
          ...envelope,
          teacherId: TEACHER_ID,
          weeklyWindows: {
            ...closedWeek(),
            1: [
              { open: '09:00', close: '12:00' },
              { open: '11:00', close: '14:00' },
            ],
          },
        }),
      ).rejects.toBeInstanceOf(ZodError);
    });

    it('throws PlanFeatureUnavailableError when the plan lacks planning.teacher-availability', async () => {
      await expect(
        saveAvailability(planWithoutFeature('planning.teacher-availability')).execute({
          ...envelope,
          teacherId: TEACHER_ID,
          weeklyWindows: closedWeek(),
        }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });
  });

  describe('GetTeacherAvailability', () => {
    it('reads back the weekly row plus live exceptions ordered by range start', async () => {
      await saveAvailability().execute({
        ...envelope,
        teacherId: TEACHER_ID,
        weeklyWindows: weekWithMonday('09:00', '12:00'),
      });
      const save = saveException();
      await save.execute({
        ...envelope,
        teacherId: TEACHER_ID,
        dateRange: { start: '2026-11-01', end: '2026-11-05' },
        label: null,
      });
      await save.execute({
        ...envelope,
        teacherId: TEACHER_ID,
        dateRange: { start: '2026-09-07', end: '2026-09-07' },
        label: 'Omra',
      });

      const view = await getAvailability().execute({ centerCode: CENTER, teacherId: TEACHER_ID });

      expect(view.availability?.weeklyWindows[1]).toEqual([{ open: '09:00', close: '12:00' }]);
      expect(view.exceptions.map((e) => e.dateRange.start)).toEqual(['2026-09-07', '2026-11-01']);
    });

    it('reads an unconfigured teacher as unrestricted with no exceptions', async () => {
      const view = await getAvailability().execute({ centerCode: CENTER, teacherId: TEACHER_ID });
      expect(view).toEqual({ availability: null, exceptions: [] });
    });

    it('throws PlanFeatureUnavailableError when the plan lacks the flag', async () => {
      await expect(
        getAvailability(planWithoutFeature('planning.teacher-availability')).execute({
          centerCode: CENTER,
          teacherId: TEACHER_ID,
        }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });
  });

  describe('SaveTeacherAvailabilityException', () => {
    it('creates an absence with the tae_ prefix and normalizes an empty label to null', async () => {
      const saved = await saveException().execute({
        ...envelope,
        teacherId: TEACHER_ID,
        dateRange: { start: '2026-10-01', end: '2026-10-15' },
        label: '',
      });

      expect(saved.id).toMatch(/^tae_/);
      expect(saved.label).toBeNull();
      expect(saved.dateRange).toEqual({ start: '2026-10-01', end: '2026-10-15' });
    });

    it('edits an existing absence by id', async () => {
      const created = await saveException().execute({
        ...envelope,
        teacherId: TEACHER_ID,
        dateRange: { start: '2026-10-01', end: '2026-10-15' },
        label: 'Omra',
      });
      clock.advance(60_000);
      const edited = await saveException().execute({
        ...envelope,
        id: created.id,
        teacherId: TEACHER_ID,
        dateRange: { start: '2026-10-01', end: '2026-10-20' },
        label: 'Omra',
      });

      expect(edited.id).toBe(created.id);
      expect(edited.dateRange.end).toBe('2026-10-20');
      expect(exceptions.all()).toHaveLength(1);
    });

    it('rejects an inverted date range with the stable end-before-start code', async () => {
      await expect(
        saveException().execute({
          ...envelope,
          teacherId: TEACHER_ID,
          dateRange: { start: '2026-10-15', end: '2026-10-01' },
          label: null,
        }),
      ).rejects.toBeInstanceOf(ZodError);
    });

    it('rejects an unknown exception id instead of creating a second row', async () => {
      await expect(
        saveException().execute({
          ...envelope,
          id: 'tae_00000000000000000000000099' as TeacherAvailabilityExceptionId,
          teacherId: TEACHER_ID,
          dateRange: { start: '2026-10-01', end: '2026-10-15' },
          label: null,
        }),
      ).rejects.toBeInstanceOf(TeacherAvailabilityExceptionNotFoundError);
    });

    it('rejects an unknown teacher', async () => {
      await expect(
        saveException().execute({
          ...envelope,
          teacherId: 'tch_00000000000000000000000099' as TeacherId,
          dateRange: { start: '2026-10-01', end: '2026-10-15' },
          label: null,
        }),
      ).rejects.toBeInstanceOf(TeacherNotFoundError);
    });

    it('throws PlanFeatureUnavailableError when the plan lacks the flag', async () => {
      await expect(
        saveException(planWithoutFeature('planning.teacher-availability')).execute({
          ...envelope,
          teacherId: TEACHER_ID,
          dateRange: { start: '2026-10-01', end: '2026-10-15' },
          label: null,
        }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });
  });

  describe('ArchiveTeacherAvailabilityException', () => {
    it('soft-deletes the absence and removes it from reads', async () => {
      const created = await saveException().execute({
        ...envelope,
        teacherId: TEACHER_ID,
        dateRange: { start: '2026-10-01', end: '2026-10-15' },
        label: null,
      });

      await archiveException().execute({ centerCode: CENTER, exceptionId: created.id, updatedBy: USER });

      const view = await getAvailability().execute({ centerCode: CENTER, teacherId: TEACHER_ID });
      expect(view.exceptions).toEqual([]);
      expect(await exceptions.findById(created.id)).toBeNull();
    });

    it('throws for an unknown or already-archived id', async () => {
      await expect(
        archiveException().execute({
          centerCode: CENTER,
          exceptionId: 'tae_00000000000000000000000099' as TeacherAvailabilityExceptionId,
          updatedBy: USER,
        }),
      ).rejects.toBeInstanceOf(TeacherAvailabilityExceptionNotFoundError);
    });

    it('throws PlanFeatureUnavailableError when the plan lacks the flag', async () => {
      await expect(
        archiveException(planWithoutFeature('planning.teacher-availability')).execute({
          centerCode: CENTER,
          exceptionId: 'tae_00000000000000000000000099' as TeacherAvailabilityExceptionId,
          updatedBy: USER,
        }),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });
  });
});
