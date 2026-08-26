import { describe, it, expect } from 'vitest';
import {
  SessionGenerator,
  type SessionGeneratorConfig,
  type SessionGenerationInput,
} from '../../../src/services/session-generator';
import type { TeacherAvailabilityRules } from '../../../src/policies/teacher-availability-policy';
import type { DayHours } from '../../../src/policies/session-conflict-policy';
import type { WeeklyTimeWindows } from '../../../src/entities/center-hours-override';
import type { GroupId, GroupKind } from '../../../src/entities/group';
import type { RoomId } from '../../../src/entities/room';
import type { StudentId } from '../../../src/entities/student';
import type { EntityId } from '../../../src/value-objects/ids';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import { fakeRandom } from '../fakes/random';

/**
 * Support-center scheduling scenarios (manual QA cases from the product owner).
 *
 * Fixed premises for every case (PS1–PS3 in the brief):
 *   - The center is open 09:00–22:00 every day; each teacher is only *available*
 *     Tuesday and Thursday 19:00–22:00, so every session lands in that window.
 *   - ST = students, G = groups, S = subjects, T = teachers.
 *   - Rooms are unlimited — never the binding constraint here.
 *
 * These tests assert the generator's REAL behavior (so they stay green and
 * document it); each block also states the product owner's EXPECTED behavior and
 * the gap, which the companion report at
 * docs/reports/scheduling-support-cases.md analyses in full.
 */

const TUE = 2 as WeekdayIndex;
const THU = 4 as WeekdayIndex;

const G1 = 'grp_00000000000000000000000001' as GroupId;
const G2 = 'grp_00000000000000000000000002' as GroupId;
const G3 = 'grp_00000000000000000000000003' as GroupId;
const G4 = 'grp_00000000000000000000000004' as GroupId;

const ROOMS: readonly RoomId[] = [
  'rom_00000000000000000000000001' as RoomId,
  'rom_00000000000000000000000002' as RoomId,
  'rom_00000000000000000000000003' as RoomId,
  'rom_00000000000000000000000004' as RoomId,
];

const T1 = 'tea_00000000000000000000000001' as EntityId;
const T2 = 'tea_00000000000000000000000002' as EntityId;

const ST1 = 'stu_00000000000000000000000001' as StudentId;
const ST11 = 'stu_00000000000000000000000011' as StudentId;
const ST12 = 'stu_00000000000000000000000012' as StudentId;
const ST21 = 'stu_00000000000000000000000021' as StudentId;
const ST22 = 'stu_00000000000000000000000022' as StudentId;

const emptyWeek = (): WeeklyTimeWindows => ({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] });

const window = (open: string, close: string) => ({ open: open as TimeOfDay, close: close as TimeOfDay });

/** Center open 09:00–22:00 on Tuesday and Thursday (the two pool days). */
const CENTER_HOURS: readonly DayHours[] = [
  { dayOfWeek: TUE, windows: [window('09:00', '22:00')] },
  { dayOfWeek: THU, windows: [window('09:00', '22:00')] },
];

/** A teacher available Tuesday and Thursday 19:00–22:00, nothing else. */
function availableTueThuEvening(): TeacherAvailabilityRules {
  return {
    weeklyWindows: {
      ...emptyWeek(),
      [TUE]: [window('19:00', '22:00')],
      [THU]: [window('19:00', '22:00')],
    },
    exceptions: [],
  };
}

function autoConfig(sessionsPerWeek: number): SessionGeneratorConfig {
  return {
    scope: { groups: 'all', teachers: 'all' },
    kind: 'regular' as GroupKind,
    weekdayPool: [TUE, THU],
    sessionsPerWeek,
    minGapDays: 1,
    sessionDurationMinutes: 90,
    range: { startDate: '2026-09-01', endDate: '2026-12-31' },
    mode: 'auto',
  };
}

function buildInput(params: {
  sessionsPerWeek: number;
  teacherByGroup: ReadonlyMap<GroupId, EntityId>;
  availabilityByTeacher: ReadonlyMap<EntityId, TeacherAvailabilityRules>;
  rosterByGroup: ReadonlyMap<GroupId, readonly StudentId[]>;
}): SessionGenerationInput {
  return {
    config: autoConfig(params.sessionsPerWeek),
    groups: [...params.teacherByGroup.keys()],
    teacherByGroup: params.teacherByGroup,
    rooms: ROOMS,
    centerHours: CENTER_HOURS,
    existingSchedule: [],
    availabilityByTeacher: params.availabilityByTeacher,
    rosterByGroup: params.rosterByGroup,
  };
}

type Result = ReturnType<SessionGenerator['generate']>;

type Slot = { day: WeekdayIndex; start: TimeOfDay; end: TimeOfDay };

function slotsOf(result: Result, groupId: GroupId): readonly Slot[] {
  const proposal = result.proposals.find((p) => p.groupId === groupId)!;
  return proposal.blocks
    .map((scheduled) => ({ day: scheduled.block.dayOfWeek, start: scheduled.block.start, end: scheduled.block.end }))
    .sort((a, b) => a.day - b.day || (a.start < b.start ? -1 : 1));
}

function studentConflictCount(result: Result): number {
  return result.conflicts.filter((c) => c.kind === 'student').length;
}

function run(params: Parameters<typeof buildInput>[0]): Result {
  return new SessionGenerator(fakeRandom()).generate(buildInput(params));
}

describe('Scheduling support cases', () => {
  describe('Case 1 — two teachers, two subjects, one student shared across both groups', () => {
    // G1 (S1) -> T1, G2 (S2) -> T2. ST1 is enrolled in BOTH G1 and G2.
    // EXPECTED (product owner): the planner staggers the two groups so ST1 can
    //   attend both — e.g. G1 19:00–20:30 and G2 20:30–22:00 on each day.
    // REAL: the shared student is NOT a placement constraint. The two groups have
    //   different teachers and different rooms, so nothing pushes them apart; both
    //   land at 19:00–20:30 and the clash is only reported as a (non-blocking)
    //   `student` conflict warning.
    it('stacks both groups at 19:00–20:30 and only WARNS about the shared student', () => {
      const result = run({
        sessionsPerWeek: 2,
        teacherByGroup: new Map([
          [G1, T1],
          [G2, T2],
        ]),
        availabilityByTeacher: new Map([
          [T1, availableTueThuEvening()],
          [T2, availableTueThuEvening()],
        ]),
        rosterByGroup: new Map([
          [G1, [ST1]],
          [G2, [ST1]],
        ]),
      });

      expect(slotsOf(result, G1)).toEqual([
        { day: TUE, start: '19:00', end: '20:30' },
        { day: THU, start: '19:00', end: '20:30' },
      ]);
      expect(slotsOf(result, G2)).toEqual([
        { day: TUE, start: '19:00', end: '20:30' },
        { day: THU, start: '19:00', end: '20:30' },
      ]);

      expect(result.conflicts.some((c) => c.kind === 'room')).toBe(false);
      expect(result.conflicts.some((c) => c.kind === 'teacher')).toBe(false);
      expect(studentConflictCount(result)).toBeGreaterThan(0);
    });
  });

  describe('Case 2 — one teacher, one subject, two groups', () => {
    // G1 & G2 (both S1) -> T1. No shared students.
    // EXPECTED: G1 19:00–20:30 then G2 20:30–22:00 (or swapped).
    // REAL: matches — the same-teacher packing rule staggers them back-to-back
    //   and reports zero conflicts.
    it('packs the two groups back-to-back with no conflicts', () => {
      const result = run({
        sessionsPerWeek: 1,
        teacherByGroup: new Map([
          [G1, T1],
          [G2, T1],
        ]),
        availabilityByTeacher: new Map([[T1, availableTueThuEvening()]]),
        rosterByGroup: new Map([
          [G1, [ST11]],
          [G2, [ST21]],
        ]),
      });

      expect(slotsOf(result, G1)).toEqual([{ day: TUE, start: '19:00', end: '20:30' }]);
      expect(slotsOf(result, G2)).toEqual([{ day: TUE, start: '20:30', end: '22:00' }]);
      expect(result.conflicts).toEqual([]);
    });
  });

  describe('Case 3 — two teachers, each teaching two groups of their own subject', () => {
    // G1,G2 (S1) -> T1 ; G3,G4 (S2) -> T2. Every group has its own students,
    // no student shared across groups.
    // EXPECTED: each teacher's two groups pack back-to-back; independent rooms, so
    //   no conflicts. REAL: matches.
    it('packs each teacher pair back-to-back with no conflicts', () => {
      const result = run({
        sessionsPerWeek: 1,
        teacherByGroup: new Map([
          [G1, T1],
          [G2, T1],
          [G3, T2],
          [G4, T2],
        ]),
        availabilityByTeacher: new Map([
          [T1, availableTueThuEvening()],
          [T2, availableTueThuEvening()],
        ]),
        rosterByGroup: new Map([
          [G1, [ST11]],
          [G2, [ST12]],
          [G3, [ST21]],
          [G4, [ST22]],
        ]),
      });

      expect(slotsOf(result, G1)).toEqual([{ day: TUE, start: '19:00', end: '20:30' }]);
      expect(slotsOf(result, G2)).toEqual([{ day: TUE, start: '20:30', end: '22:00' }]);
      expect(slotsOf(result, G3)).toEqual([{ day: TUE, start: '19:00', end: '20:30' }]);
      expect(slotsOf(result, G4)).toEqual([{ day: TUE, start: '20:30', end: '22:00' }]);
      expect(result.conflicts).toEqual([]);
    });
  });

  describe('Case 4 — two teachers, students shared across BOTH subjects', () => {
    // G1,G2 (S1) -> T1 ; G3,G4 (S2) -> T2.
    // Rosters: G1={ST11,ST12}, G2={ST21,ST22}, G3={ST11,ST21}, G4={ST12,ST22}.
    // Every student sits in exactly one S1 group and one S2 group, so every S1
    // group clashes with every S2 group unless they are on different days/times.
    const rosters = new Map([
      [G1, [ST11, ST12]],
      [G2, [ST21, ST22]],
      [G3, [ST11, ST21]],
      [G4, [ST12, ST22]],
    ]);
    const teachers = new Map([
      [G1, T1],
      [G2, T1],
      [G3, T2],
      [G4, T2],
    ]);
    const availability = new Map([
      [T1, availableTueThuEvening()],
      [T2, availableTueThuEvening()],
    ]);

    // A CONFLICT-FREE schedule exists at 1 session/week: put T1's groups on
    // Tuesday and T2's groups on Thursday (or vice-versa). Then no student's two
    // groups ever share a day. The greedy planner does NOT find it: it fills the
    // earliest pool day first and never uses student rosters as a placement
    // constraint, so it stacks all four groups on Tuesday and produces avoidable
    // student clashes.
    it('1 session/week: a conflict-free split exists, but the planner stacks all groups on Tuesday and warns', () => {
      const result = run({ sessionsPerWeek: 1, teacherByGroup: teachers, availabilityByTeacher: availability, rosterByGroup: rosters });

      for (const group of [G1, G2, G3, G4]) {
        expect(slotsOf(result, group).every((s) => s.day === TUE)).toBe(true);
      }
      // ST11 (G1 & G3) and ST22 (G2 & G4) both land at the same time → clash;
      // ST12 and ST21 happen to fall on adjacent (non-overlapping) blocks.
      expect(studentConflictCount(result)).toBeGreaterThan(0);
      expect(result.conflicts.some((c) => c.kind === 'room')).toBe(false);
      expect(result.conflicts.some((c) => c.kind === 'teacher')).toBe(false);
    });

    // At 2 sessions/week the scenario is genuinely INFEASIBLE: each teacher's two
    // groups already consume the whole 19:00–22:00 window on BOTH Tuesday and
    // Thursday, so the other teacher's groups cannot help but overlap them — every
    // shared student is double-booked. Conflicts here are unavoidable, not a
    // planner weakness.
    it('2 sessions/week: overlap is unavoidable — student conflicts are reported', () => {
      const result = run({ sessionsPerWeek: 2, teacherByGroup: teachers, availabilityByTeacher: availability, rosterByGroup: rosters });

      for (const group of [G1, G2, G3, G4]) {
        expect(slotsOf(result, group).length).toBe(2);
      }
      expect(studentConflictCount(result)).toBeGreaterThan(0);
    });
  });
});
