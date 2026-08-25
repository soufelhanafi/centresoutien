import { describe, it, expect, beforeEach } from 'vitest';
import {
  PreviewGeneratedSchedule,
  type PreviewGeneratedScheduleInput,
} from '../../../src/use-cases/preview-generated-schedule';
import { SessionGenerator } from '../../../src/services/session-generator';
import type { SessionGeneratorConfig } from '../../../src/services/session-generator';
import { PlanPolicy } from '../../../src/plans/plan-policy';
import { PLANS, type FeatureFlag, type Plan } from '../../../src/plans/plans';
import { PlanFeatureUnavailableError } from '../../../src/errors/plan-errors';
import { GroupExceedsRoomCapacityError } from '../../../src/errors/session-generator-errors';
import { newEnvelope } from '../../../src/entities/envelope';
import type { Group, GroupId } from '../../../src/entities/group';
import type { SubjectId } from '../../../src/entities/subject';
import type { RoomId } from '../../../src/entities/room';
import type { Enrollment, EnrollmentId } from '../../../src/entities/enrollment';
import type { StudentId } from '../../../src/entities/student';
import type { TeacherId } from '../../../src/entities/teacher';
import type { WeeklyRecurringSession, WeeklyRecurringSessionId } from '../../../src/entities/weekly-recurring-session';
import type { CenterCode, DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { TimeWindow } from '../../../src/value-objects/time-window';
import type { WeeklyTimeWindows } from '../../../src/entities/center-hours-override';
import type { TeacherAvailability, TeacherAvailabilityId } from '../../../src/entities/teacher-availability';
import type {
  TeacherAvailabilityException,
  TeacherAvailabilityExceptionId,
} from '../../../src/entities/teacher-availability-exception';
import { InMemoryGroupRepository } from '../fakes/in-memory-group-repository';
import { InMemoryRoomRepository } from '../fakes/in-memory-room-repository';
import { InMemoryCenterHoursRepository } from '../fakes/in-memory-center-hours-repository';
import { InMemoryWeeklyRecurringSessionRepository } from '../fakes/in-memory-weekly-recurring-session-repository';
import { InMemoryTeacherAvailabilityRepository } from '../fakes/in-memory-teacher-availability-repository';
import { InMemoryTeacherAvailabilityExceptionRepository } from '../fakes/in-memory-teacher-availability-exception-repository';
import { InMemoryEnrollmentRepository } from '../fakes/in-memory-enrollment-repository';
import { fakeClock } from '../fakes/clock';
import { fakeRandom } from '../fakes/random';
import { planWithoutFeature } from '../fakes/plans';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const SUBJECT_ID = 'sub_00000000000000000000000001' as SubjectId;
const ROOM_A = 'rom_00000000000000000000000001' as RoomId;
const ROOM_B = 'rom_00000000000000000000000002' as RoomId;
const TEACHER_1 = 'tch_00000000000000000000000001' as TeacherId;
const TEACHER_2 = 'tch_00000000000000000000000002' as TeacherId;
const MON = 1 as WeekdayIndex;
const WED = 3 as WeekdayIndex;

const envelopeClock = fakeClock('2026-07-29T10:00:00Z');

let groupSeq = 0;
function makeGroup(overrides: Partial<Group> = {}): Group {
  groupSeq += 1;
  return {
    id: `grp_${String(groupSeq).padStart(26, '0')}` as GroupId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    subjectId: SUBJECT_ID,
    teacherId: null,
    level: '2ème Bac',
    capacity: 15,
    kind: 'regular',
    active: true,
    ...overrides,
  };
}

function makeRoom(id: RoomId, overrides: Partial<{ centerCode: CenterCode; capacity: number }> = {}) {
  return {
    id,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    name: id,
    capacity: 20,
    active: true,
    ...overrides,
  };
}

let wrsSeq = 0;
function makeRecurring(overrides: Partial<WeeklyRecurringSession> = {}): WeeklyRecurringSession {
  wrsSeq += 1;
  return {
    id: `wrs_${String(wrsSeq).padStart(26, '0')}` as WeeklyRecurringSessionId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    roomId: ROOM_A,
    teacherId: null,
    groupId: null,
    dayOfWeek: MON,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    active: true,
    validFrom: null,
    validTo: null,
    ...overrides,
  };
}

function autoConfig(overrides: Partial<SessionGeneratorConfig> = {}): SessionGeneratorConfig {
  return {
    scope: { groups: 'all', teachers: 'all' },
    kind: 'regular',
    weekdayPool: [MON, WED],
    sessionsPerWeek: 1,
    minGapDays: 1,
    sessionDurationMinutes: 90,
    range: { startDate: '2026-09-01', endDate: '2026-12-31' },
    mode: 'auto',
    ...overrides,
  } as SessionGeneratorConfig;
}

const emptyWeek = (): WeeklyTimeWindows => ({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] });
const window = (open: string, close: string): TimeWindow => ({
  open: open as TimeOfDay,
  close: close as TimeOfDay,
});

let enrollmentSeq = 0;
function makeEnrollment(studentId: StudentId, groupId: GroupId): Enrollment {
  enrollmentSeq += 1;
  return {
    id: `enr_${String(enrollmentSeq).padStart(26, '0')}` as EnrollmentId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    studentId,
    groupId,
    startMonth: '2026-09',
    endMonth: null,
    unenrolledUnderTeacherId: null,
  };
}

let availabilitySeq = 0;
function makeAvailability(teacherId: TeacherId, weeklyWindows: WeeklyTimeWindows): TeacherAvailability {
  availabilitySeq += 1;
  return {
    id: `tav_${String(availabilitySeq).padStart(26, '0')}` as TeacherAvailabilityId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    teacherId,
    weeklyWindows,
  };
}

let exceptionSeq = 0;
function makeException(
  teacherId: TeacherId,
  dateRange: { start: string; end: string },
): TeacherAvailabilityException {
  exceptionSeq += 1;
  return {
    id: `tae_${String(exceptionSeq).padStart(26, '0')}` as TeacherAvailabilityExceptionId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, envelopeClock),
    teacherId,
    dateRange,
    label: null,
  };
}

describe('PreviewGeneratedSchedule', () => {
  let groups: InMemoryGroupRepository;
  let rooms: InMemoryRoomRepository;
  let centerHours: InMemoryCenterHoursRepository;
  let recurrences: InMemoryWeeklyRecurringSessionRepository;
  let availability: InMemoryTeacherAvailabilityRepository;
  let availabilityExceptions: InMemoryTeacherAvailabilityExceptionRepository;
  let enrollments: InMemoryEnrollmentRepository;
  let useCase: PreviewGeneratedSchedule;

  function build(plan: Plan = PLANS.premium): PreviewGeneratedSchedule {
    return new PreviewGeneratedSchedule(
      groups,
      rooms,
      centerHours,
      recurrences,
      availability,
      availabilityExceptions,
      enrollments,
      new SessionGenerator(fakeRandom()),
      new PlanPolicy(plan),
    );
  }

  function input(config: SessionGeneratorConfig): PreviewGeneratedScheduleInput {
    return { centerCode: CENTER, config };
  }

  beforeEach(async () => {
    groups = new InMemoryGroupRepository();
    rooms = new InMemoryRoomRepository();
    centerHours = new InMemoryCenterHoursRepository();
    recurrences = new InMemoryWeeklyRecurringSessionRepository();
    availability = new InMemoryTeacherAvailabilityRepository();
    availabilityExceptions = new InMemoryTeacherAvailabilityExceptionRepository();
    enrollments = new InMemoryEnrollmentRepository();
    await rooms.save(makeRoom(ROOM_A));
    useCase = build();
  });

  describe('scope resolution', () => {
    it('resolves scope "all" to every live group of the matching kind', async () => {
      const g1 = makeGroup();
      const g2 = makeGroup();
      const examPrep = makeGroup({ kind: 'exam-prep' });
      await groups.save(g1);
      await groups.save(g2);
      await groups.save(examPrep);

      const result = await useCase.execute(input(autoConfig()));
      expect(result.proposals.map((p) => p.groupId).sort()).toEqual([g1.id, g2.id].sort());
    });

    it('excludes tombstoned groups', async () => {
      const g1 = makeGroup();
      const gone = makeGroup();
      await groups.save(g1);
      await groups.save(gone);
      await groups.softDelete(gone.id, new Date('2026-08-01T00:00:00Z'), USER);

      const result = await useCase.execute(input(autoConfig()));
      expect(result.proposals.map((p) => p.groupId)).toEqual([g1.id]);
    });

    it('narrows to explicit group ids when scope.groups is not "all"', async () => {
      const g1 = makeGroup();
      const g2 = makeGroup();
      await groups.save(g1);
      await groups.save(g2);

      const result = await useCase.execute(
        input(autoConfig({ scope: { groups: [g1.id], teachers: 'all' } })),
      );
      expect(result.proposals.map((p) => p.groupId)).toEqual([g1.id]);
    });

    it('narrows to groups staffed by the named teachers when scope.teachers is not "all"', async () => {
      const staffed = makeGroup({ teacherId: TEACHER_1 as unknown as EntityId });
      const otherTeacher = makeGroup({ teacherId: TEACHER_2 as unknown as EntityId });
      const unstaffed = makeGroup({ teacherId: null });
      await groups.save(staffed);
      await groups.save(otherTeacher);
      await groups.save(unstaffed);

      const result = await useCase.execute(
        input(autoConfig({ scope: { groups: 'all', teachers: [TEACHER_1] } })),
      );
      expect(result.proposals.map((p) => p.groupId)).toEqual([staffed.id]);
    });

    it('never mixes exam-prep groups into a regular-kind run, and vice versa', async () => {
      const regular = makeGroup({ kind: 'regular' });
      const examPrep = makeGroup({ kind: 'exam-prep' });
      await groups.save(regular);
      await groups.save(examPrep);

      const regularResult = await useCase.execute(input(autoConfig({ kind: 'regular' })));
      expect(regularResult.proposals.map((p) => p.groupId)).toEqual([regular.id]);

      const examPrepResult = await useCase.execute(input(autoConfig({ kind: 'exam-prep' })));
      expect(examPrepResult.proposals.map((p) => p.groupId)).toEqual([examPrep.id]);
    });
  });

  describe('room and hours resolution', () => {
    it('draws rooms from every live room of the center', async () => {
      await rooms.save(makeRoom(ROOM_B));
      const g1 = makeGroup();
      await groups.save(g1);

      const result = await useCase.execute(input(autoConfig()));
      const usedRooms = new Set(result.proposals[0]!.blocks.map((b) => b.roomId));
      expect([...usedRooms].every((id) => id === ROOM_A || id === ROOM_B)).toBe(true);
    });

    it('falls back to the default week (09:00–18:00 every day) when no CenterHours rows exist', async () => {
      const g1 = makeGroup();
      await groups.save(g1);

      const result = await useCase.execute(input(autoConfig()));
      expect(result.proposals[0]!.blocks.every((b) => b.block.start === '09:00')).toBe(true);
    });
  });

  describe('conflicts against the real schedule', () => {
    it('reports a room conflict against an already-committed session', async () => {
      const g1 = makeGroup();
      await groups.save(g1);
      await recurrences.save(
        makeRecurring({ roomId: ROOM_A, dayOfWeek: MON, start: '09:00' as TimeOfDay, end: '10:30' as TimeOfDay }),
      );

      const result = await useCase.execute(input(autoConfig({ weekdayPool: [MON], sessionsPerWeek: 1 })));
      expect(result.conflicts.some((c) => c.kind === 'room')).toBe(true);
    });

    it('reports no conflict when the existing schedule sits on a weekday outside the pool', async () => {
      const g1 = makeGroup();
      await groups.save(g1);
      const OTHER_DAY = 5 as WeekdayIndex; // Friday, not in the pool below
      await recurrences.save(makeRecurring({ roomId: ROOM_A, dayOfWeek: OTHER_DAY }));

      const result = await useCase.execute(input(autoConfig({ weekdayPool: [MON], sessionsPerWeek: 1 })));
      expect(result.conflicts).toEqual([]);
    });
  });

  describe('student double-booked across two groups (reported scenario: dual-subject students split across parallel groups)', () => {
    const STUDENT = 'stu_00000000000000000000000001' as StudentId;

    it('flags a student enrolled in both a Math and a Physics group scheduled at the exact same time', async () => {
      const math = makeGroup();
      const physics = makeGroup();
      await groups.save(math);
      await groups.save(physics);
      await rooms.save(makeRoom(ROOM_B));
      await enrollments.save(makeEnrollment(STUDENT, math.id));
      await enrollments.save(makeEnrollment(STUDENT, physics.id));

      // Custom mode with the same picked weekday for both groups anchors both at
      // the identical earliest-fitting slot — deterministic, no random day search.
      const result = await useCase.execute(
        input(
          autoConfig({
            mode: 'custom',
            pickedWeekdays: [MON],
            sessionDurationMinutes: 90,
          } as Partial<SessionGeneratorConfig>),
        ),
      );

      const studentConflicts = result.conflicts.filter((c) => c.kind === 'student');
      expect(studentConflicts.length).toBeGreaterThan(0);
      expect(studentConflicts.map((c) => c.groupId).sort()).toEqual([math.id, physics.id].sort());
    });

    it('does not flag a student conflict when the two groups share no student', async () => {
      const math = makeGroup();
      const physics = makeGroup();
      await groups.save(math);
      await groups.save(physics);
      await rooms.save(makeRoom(ROOM_B));
      await enrollments.save(makeEnrollment(STUDENT, math.id));

      const result = await useCase.execute(
        input(
          autoConfig({
            mode: 'custom',
            pickedWeekdays: [MON],
            sessionDurationMinutes: 90,
          } as Partial<SessionGeneratorConfig>),
        ),
      );

      expect(result.conflicts.filter((c) => c.kind === 'student')).toEqual([]);
    });
  });

  describe('teacher availability (SOU-259, SOU-296)', () => {
    it('anchors inside the staffing teacher’s weekly window instead of the center-open default', async () => {
      await groups.save(makeGroup({ teacherId: TEACHER_1 as unknown as EntityId }));
      await availability.save(
        makeAvailability(TEACHER_1, { ...emptyWeek(), [MON]: [window('14:00', '16:00')] }),
      );

      const result = await useCase.execute(input(autoConfig({ weekdayPool: [MON], sessionsPerWeek: 1 })));

      expect(result.proposals[0]!.blocks).toEqual([
        expect.objectContaining({ block: expect.objectContaining({ start: '14:00', end: '15:30' }) }),
      ]);
      expect(result.proposals[0]!.requestedSessionsPerWeek).toBe(1);
      expect(result.conflicts.some((c) => c.kind === 'teacher-availability')).toBe(false);
    });

    it('generates no session when no window on the only eligible day fits the session duration', async () => {
      await groups.save(makeGroup({ teacherId: TEACHER_1 as unknown as EntityId }));
      await availability.save(
        // Only a 30-minute gap — too short for the 90-minute session, and no other day is in the pool.
        makeAvailability(TEACHER_1, { ...emptyWeek(), [MON]: [window('14:00', '14:30')] }),
      );

      const result = await useCase.execute(input(autoConfig({ weekdayPool: [MON], sessionsPerWeek: 1 })));

      expect(result.proposals[0]!.blocks).toHaveLength(0);
      expect(result.proposals[0]!.requestedSessionsPerWeek).toBe(1);
      expect(result.conflicts.some((c) => c.kind === 'teacher-availability')).toBe(false);
    });

    it('never flags availability when the plan lacks planning.teacher-availability', async () => {
      await groups.save(makeGroup({ teacherId: TEACHER_1 as unknown as EntityId }));
      await availability.save(
        makeAvailability(TEACHER_1, { ...emptyWeek(), [MON]: [window('14:00', '16:00')] }),
      );

      const result = await build(planWithoutFeature('planning.teacher-availability')).execute(
        input(autoConfig({ weekdayPool: [MON], sessionsPerWeek: 1 })),
      );

      expect(result.conflicts.some((c) => c.kind === 'teacher-availability')).toBe(false);
    });

    it('generates no session for a one-off absence overlapping the run range, even with no weekly pattern', async () => {
      await groups.save(makeGroup({ teacherId: TEACHER_1 as unknown as EntityId }));
      await availabilityExceptions.save(
        makeException(TEACHER_1, { start: '2026-10-01', end: '2026-10-15' }),
      );

      const result = await useCase.execute(input(autoConfig({ weekdayPool: [MON], sessionsPerWeek: 1 })));

      expect(result.proposals[0]!.blocks).toHaveLength(0);
      expect(result.proposals[0]!.requestedSessionsPerWeek).toBe(1);
      expect(result.conflicts.some((c) => c.kind === 'teacher-availability')).toBe(false);
    });

    it('ignores an absence entirely outside the run range', async () => {
      await groups.save(makeGroup({ teacherId: TEACHER_1 as unknown as EntityId }));
      await availabilityExceptions.save(
        makeException(TEACHER_1, { start: '2027-01-01', end: '2027-01-15' }),
      );

      const result = await useCase.execute(input(autoConfig({ weekdayPool: [MON], sessionsPerWeek: 1 })));

      expect(result.conflicts).toEqual([]);
    });

    it('ignores availability rows of teachers outside the run scope', async () => {
      await groups.save(makeGroup({ teacherId: null }));
      await availability.save(makeAvailability(TEACHER_2, emptyWeek()));

      const result = await useCase.execute(input(autoConfig({ weekdayPool: [MON], sessionsPerWeek: 1 })));

      expect(result.conflicts).toEqual([]);
    });
  });

  describe('seat capacity (SOU-272)', () => {
    it('only ever assigns a room large enough to seat the group', async () => {
      // ROOM_A (from beforeEach) holds 20; re-save it at 10 and add ROOM_B at 20.
      // The group needs 16 — only ROOM_B fits.
      await rooms.save(makeRoom(ROOM_A, { capacity: 10 }));
      await rooms.save(makeRoom(ROOM_B, { capacity: 20 }));
      await groups.save(makeGroup({ capacity: 16 }));

      const result = await useCase.execute(input(autoConfig({ weekdayPool: [MON], sessionsPerWeek: 1 })));

      expect(result.proposals[0]!.blocks.every((block) => block.roomId === ROOM_B)).toBe(true);
    });

    it('fails fast on the preview when a group outgrows every room', async () => {
      // Only ROOM_A (holds 20) exists; the group needs 25.
      await groups.save(makeGroup({ capacity: 25 }));

      await expect(
        useCase.execute(input(autoConfig({ weekdayPool: [MON], sessionsPerWeek: 1 }))),
      ).rejects.toBeInstanceOf(GroupExceedsRoomCapacityError);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError for auto mode when the plan lacks planning.random-auto', async () => {
      await expect(
        build(planWithoutFeature('planning.random-auto')).execute(input(autoConfig({ mode: 'auto' }))),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });

    it('throws PlanFeatureUnavailableError for custom mode when the plan lacks planning.custom-grid', async () => {
      await expect(
        build(planWithoutFeature('planning.custom-grid')).execute(
          input(autoConfig({ mode: 'custom', pickedWeekdays: [MON] })),
        ),
      ).rejects.toBeInstanceOf(PlanFeatureUnavailableError);
    });

    it('allows custom mode on Pro (does not require planning.random-auto)', async () => {
      const g1 = makeGroup();
      await groups.save(g1);
      await expect(
        build(PLANS.pro).execute(input(autoConfig({ mode: 'custom', pickedWeekdays: [MON] }))),
      ).resolves.toBeDefined();
    });

    it('rejects a plan with an empty feature set outright', async () => {
      const planWithout: Plan = {
        id: 'essentiel',
        features: new Set<FeatureFlag>(),
        limits: PLANS.essentiel.limits,
      };
      await expect(build(planWithout).execute(input(autoConfig()))).rejects.toBeInstanceOf(
        PlanFeatureUnavailableError,
      );
    });
  });
});
