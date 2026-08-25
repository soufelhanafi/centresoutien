import { describe, it, expect } from 'vitest';
import { detectGeneratedScheduleConflicts } from '../../../src/policies/generated-schedule-conflicts';
import type { GeneratedBlockCandidate } from '../../../src/policies/generated-schedule-conflicts';
import type { DayHours } from '../../../src/policies/session-conflict-policy';
import type { ScheduledSessionRef } from '../../../src/errors/scheduling-errors';
import type { GroupId } from '../../../src/entities/group';
import type { RoomId } from '../../../src/entities/room';
import type { StudentId } from '../../../src/entities/student';
import type { EntityId } from '../../../src/value-objects/ids';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';

const G1 = 'grp_00000000000000000000000001' as GroupId;
const G2 = 'grp_00000000000000000000000002' as GroupId;
const G3 = 'grp_00000000000000000000000003' as GroupId;

const ROOM_A = 'rom_00000000000000000000000001' as RoomId;
const ROOM_B = 'rom_00000000000000000000000002' as RoomId;
const TEACHER_A = 'tea_00000000000000000000000001' as EntityId;
const TEACHER_B = 'tea_00000000000000000000000002' as EntityId;

const MON = 1 as WeekdayIndex;

// Open Mon 09:00–18:00 only — enough for these tests.
const centerHours: readonly DayHours[] = [
  { dayOfWeek: MON, windows: [{ open: '09:00' as TimeOfDay, close: '18:00' as TimeOfDay }] },
];

function block(
  groupId: GroupId,
  roomId: RoomId,
  start: string,
  end: string,
  dayOfWeek: WeekdayIndex = MON,
  teacherId: EntityId | null = null,
): GeneratedBlockCandidate {
  return {
    groupId,
    roomId,
    teacherId,
    block: { dayOfWeek, start: start as TimeOfDay, end: end as TimeOfDay },
  };
}

function existingRef(roomId: RoomId, start: string, end: string, teacherId?: EntityId): ScheduledSessionRef {
  const ref: ScheduledSessionRef = {
    id: 'ses_existing' as EntityId,
    roomId,
    dayOfWeek: MON,
    start: start as TimeOfDay,
    end: end as TimeOfDay,
  };
  return teacherId === undefined ? ref : { ...ref, teacherId };
}

describe('detectGeneratedScheduleConflicts', () => {
  it('returns no conflicts when every block is in-hours and rooms are free', () => {
    const result = detectGeneratedScheduleConflicts(
      [block(G1, ROOM_A, '09:00', '10:30'), block(G2, ROOM_B, '09:00', '10:30')],
      [],
      centerHours,
    );
    expect(result).toEqual([]);
  });

  describe('center-hours overrun', () => {
    it('flags a block whose end runs past closing time', () => {
      const result = detectGeneratedScheduleConflicts([block(G1, ROOM_A, '17:00', '19:00')], [], centerHours);
      expect(result).toEqual([
        {
          kind: 'hours',
          groupId: G1,
          start: '17:00',
          end: '19:00',
          error: expect.objectContaining({ reason: 'after-close' }),
        },
      ]);
    });

    it('does not flag a block that fits exactly up to closing time', () => {
      const result = detectGeneratedScheduleConflicts([block(G1, ROOM_A, '16:30', '18:00')], [], centerHours);
      expect(result).toEqual([]);
    });
  });

  describe('room conflict against the already-committed schedule', () => {
    it('flags a generated block overlapping an existing session in the same room', () => {
      const result = detectGeneratedScheduleConflicts(
        [block(G1, ROOM_A, '09:00', '10:30')],
        [existingRef(ROOM_A, '10:00', '11:00')],
        centerHours,
      );
      expect(result).toEqual([
        {
          kind: 'room',
          groupId: G1,
          start: '09:00',
          end: '10:30',
          error: expect.objectContaining({ roomId: ROOM_A }),
        },
      ]);
    });

    it('does not flag a back-to-back existing session (touching endpoints)', () => {
      const result = detectGeneratedScheduleConflicts(
        [block(G1, ROOM_A, '09:00', '10:30')],
        [existingRef(ROOM_A, '10:30', '12:00')],
        centerHours,
      );
      expect(result).toEqual([]);
    });

    it('does not flag an overlap in a different room', () => {
      const result = detectGeneratedScheduleConflicts(
        [block(G1, ROOM_A, '09:00', '10:30')],
        [existingRef(ROOM_B, '09:00', '10:30')],
        centerHours,
      );
      expect(result).toEqual([]);
    });
  });

  describe('room conflict across sibling proposals in the same run', () => {
    it('flags two different groups double-booked into the same room at an overlapping time', () => {
      const result = detectGeneratedScheduleConflicts(
        [block(G1, ROOM_A, '09:00', '10:30'), block(G2, ROOM_A, '09:30', '11:00')],
        [],
        centerHours,
      );
      expect(result).toHaveLength(2);
      expect(result.map((c) => c.kind)).toEqual(['room', 'room']);
      expect(result.map((c) => c.groupId).sort()).toEqual([G1, G2]);
      expect(result.map((c) => ({ start: c.start, end: c.end }))).toEqual([
        { start: '09:00', end: '10:30' },
        { start: '09:30', end: '11:00' },
      ]);
    });

    it('does not flag two groups sharing a room back-to-back (continuity)', () => {
      const result = detectGeneratedScheduleConflicts(
        [block(G1, ROOM_A, '09:00', '10:30'), block(G2, ROOM_A, '10:30', '12:00')],
        [],
        centerHours,
      );
      expect(result).toEqual([]);
    });

    it('does not compare a block against itself', () => {
      const result = detectGeneratedScheduleConflicts([block(G1, ROOM_A, '09:00', '10:30')], [], centerHours);
      expect(result).toEqual([]);
    });

    it('scales to three groups, flagging only the overlapping pair', () => {
      const result = detectGeneratedScheduleConflicts(
        [
          block(G1, ROOM_A, '09:00', '10:30'),
          block(G2, ROOM_B, '09:00', '10:30'),
          block(G3, ROOM_A, '10:00', '11:30'),
        ],
        [],
        centerHours,
      );
      expect(result.map((c) => c.groupId).sort()).toEqual([G1, G3]);
    });
  });

  describe('teacher conflict against the already-committed schedule', () => {
    it('flags a generated block overlapping an existing session for the same teacher', () => {
      const result = detectGeneratedScheduleConflicts(
        [block(G1, ROOM_A, '09:00', '10:30', MON, TEACHER_A)],
        [existingRef(ROOM_B, '10:00', '11:00', TEACHER_A)],
        centerHours,
      );

      expect(result).toEqual([
        {
          kind: 'teacher',
          groupId: G1,
          start: '09:00',
          end: '10:30',
          error: expect.objectContaining({ teacherId: TEACHER_A }),
        },
      ]);
    });

    it('does not flag teacher conflict when candidate teacher is null or different', () => {
      const nullTeacher = detectGeneratedScheduleConflicts(
        [block(G1, ROOM_A, '09:00', '10:30')],
        [existingRef(ROOM_B, '09:00', '10:30', TEACHER_A)],
        centerHours,
      );
      const differentTeacher = detectGeneratedScheduleConflicts(
        [block(G1, ROOM_A, '09:00', '10:30', MON, TEACHER_B)],
        [existingRef(ROOM_B, '09:00', '10:30', TEACHER_A)],
        centerHours,
      );

      expect(nullTeacher).toEqual([]);
      expect(differentTeacher).toEqual([]);
    });
  });

  describe('teacher conflict between generated sibling proposals', () => {
    it('flags both generated blocks when the same teacher overlaps in different rooms', () => {
      const result = detectGeneratedScheduleConflicts(
        [
          block(G1, ROOM_A, '09:00', '10:30', MON, TEACHER_A),
          block(G2, ROOM_B, '10:00', '11:00', MON, TEACHER_A),
        ],
        [],
        centerHours,
      );

      expect(result).toEqual([
        { kind: 'teacher', groupId: G1, start: '09:00', end: '10:30', error: expect.objectContaining({ teacherId: TEACHER_A }) },
        { kind: 'teacher', groupId: G2, start: '10:00', end: '11:00', error: expect.objectContaining({ teacherId: TEACHER_A }) },
      ]);
    });
  });

  it('reports both an hours overrun and a room conflict for the same block', () => {
    const result = detectGeneratedScheduleConflicts(
      [block(G1, ROOM_A, '17:00', '19:00')],
      [existingRef(ROOM_A, '17:30', '18:30')],
      centerHours,
    );
    expect(result.map((c) => c.kind).sort()).toEqual(['hours', 'room']);
  });

  describe('capacity overflow (SOU-275)', () => {
    function seatFit(
      rooms: readonly (readonly [RoomId, number])[],
      groups: readonly (readonly [GroupId, number])[],
    ): { roomCapacity: ReadonlyMap<RoomId, number>; seatsByGroup: ReadonlyMap<GroupId, number> } {
      return { roomCapacity: new Map(rooms), seatsByGroup: new Map(groups) };
    }

    it('flags a block whose assigned room cannot seat its group, attributing the block', () => {
      const result = detectGeneratedScheduleConflicts(
        [block(G1, ROOM_A, '09:00', '10:30')],
        [],
        centerHours,
        undefined,
        seatFit([[ROOM_A, 12]], [[G1, 16]]),
      );

      expect(result).toEqual([
        {
          kind: 'capacity',
          groupId: G1,
          dayOfWeek: MON,
          start: '09:00',
          end: '10:30',
          roomId: ROOM_A,
          groupCapacity: 16,
          roomCapacity: 12,
        },
      ]);
    });

    it.each([
      { name: 'room seats the group exactly', seatFit: seatFit([[ROOM_A, 16]], [[G1, 16]]) },
      { name: 'assigned room has unknown capacity', seatFit: seatFit([[ROOM_B, 12]], [[G1, 16]]) },
      { name: 'group has unknown seat count', seatFit: seatFit([[ROOM_A, 12]], [[G2, 16]]) },
      { name: 'no seat-fit context is supplied', seatFit: undefined },
    ])('reports no capacity conflict when $name', ({ seatFit: context }) => {
      const result = detectGeneratedScheduleConflicts(
        [block(G1, ROOM_A, '09:00', '10:30')],
        [],
        centerHours,
        undefined,
        context,
      );
      expect(result).toEqual([]);
    });

    it('flags only the overflowing block among several', () => {
      const result = detectGeneratedScheduleConflicts(
        [block(G1, ROOM_A, '09:00', '10:30'), block(G2, ROOM_B, '11:00', '12:30')],
        [],
        centerHours,
        undefined,
        seatFit(
          [
            [ROOM_A, 12],
            [ROOM_B, 20],
          ],
          [
            [G1, 16],
            [G2, 18],
          ],
        ),
      );

      expect(result).toEqual([
        {
          kind: 'capacity',
          groupId: G1,
          dayOfWeek: MON,
          start: '09:00',
          end: '10:30',
          roomId: ROOM_A,
          groupCapacity: 16,
          roomCapacity: 12,
        },
      ]);
    });
  });

  describe('student double-booked across two of this run\'s groups', () => {
    const STUDENT = 'stu_00000000000000000000000001' as StudentId;
    const OTHER_STUDENT = 'stu_00000000000000000000000002' as StudentId;

    it('flags a shared student attending two overlapping groups, on both blocks', () => {
      const result = detectGeneratedScheduleConflicts(
        [block(G1, ROOM_A, '09:00', '10:30'), block(G2, ROOM_B, '10:00', '11:00')],
        [],
        centerHours,
        undefined,
        undefined,
        new Map([
          [G1, [STUDENT]],
          [G2, [STUDENT]],
        ]),
      );

      const studentConflicts = result.filter((c) => c.kind === 'student');
      expect(studentConflicts).toHaveLength(2);
      expect(studentConflicts.map((c) => c.groupId).sort()).toEqual([G1, G2]);
      expect(studentConflicts[0]).toMatchObject({
        conflicts: [{ studentId: STUDENT }],
      });
    });

    it('does not flag a student conflict when the two groups share no student', () => {
      const result = detectGeneratedScheduleConflicts(
        [block(G1, ROOM_A, '09:00', '10:30'), block(G2, ROOM_B, '10:00', '11:00')],
        [],
        centerHours,
        undefined,
        undefined,
        new Map([
          [G1, [STUDENT]],
          [G2, [OTHER_STUDENT]],
        ]),
      );

      expect(result.filter((c) => c.kind === 'student')).toEqual([]);
    });

    it('does not flag a student conflict against the same group', () => {
      const result = detectGeneratedScheduleConflicts(
        [block(G1, ROOM_A, '09:00', '10:30'), block(G1, ROOM_A, '10:30', '12:00')],
        [],
        centerHours,
        undefined,
        undefined,
        new Map([[G1, [STUDENT]]]),
      );

      expect(result.filter((c) => c.kind === 'student')).toEqual([]);
    });

    it('never flags a student conflict when rosterByGroup is absent', () => {
      const result = detectGeneratedScheduleConflicts(
        [block(G1, ROOM_A, '09:00', '10:30'), block(G2, ROOM_B, '10:00', '11:00')],
        [],
        centerHours,
      );

      expect(result.filter((c) => c.kind === 'student')).toEqual([]);
    });

    it('is invisible to the room/teacher checks — a shared student in different rooms with different teachers stays clean otherwise', () => {
      const result = detectGeneratedScheduleConflicts(
        [
          block(G1, ROOM_A, '09:00', '10:30', MON, TEACHER_A),
          block(G2, ROOM_B, '09:00', '10:30', MON, TEACHER_B),
        ],
        [],
        centerHours,
        undefined,
        undefined,
        new Map([
          [G1, [STUDENT]],
          [G2, [STUDENT]],
        ]),
      );

      expect(result.map((c) => c.kind).sort()).toEqual(['student', 'student']);
    });
  });
});
