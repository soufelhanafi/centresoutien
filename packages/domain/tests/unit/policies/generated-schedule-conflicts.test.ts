import { describe, it, expect } from 'vitest';
import { detectGeneratedScheduleConflicts } from '../../../src/policies/generated-schedule-conflicts';
import type { GeneratedBlockCandidate } from '../../../src/policies/generated-schedule-conflicts';
import type { DayHours } from '../../../src/policies/session-conflict-policy';
import type { ScheduledSessionRef } from '../../../src/errors/scheduling-errors';
import type { GroupId } from '../../../src/entities/group';
import type { RoomId } from '../../../src/entities/room';
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
  { dayOfWeek: MON, open: '09:00' as TimeOfDay, close: '18:00' as TimeOfDay },
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
});
