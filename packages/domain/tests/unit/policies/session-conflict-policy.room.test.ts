import { describe, it, expect } from 'vitest';
import { SessionConflictPolicy } from '../../../src/policies/session-conflict-policy';
import { RoomConflictError } from '../../../src/errors/scheduling-errors';
import type { ScheduledSessionRef } from '../../../src/errors/scheduling-errors';
import type { RoomSessionCandidate } from '../../../src/policies/session-conflict-policy';
import type { EntityId } from '../../../src/value-objects/ids';
import type { RoomId } from '../../../src/entities/room';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';

// The two rooms and a couple of session ids the cases below reference.
const ROOM_A = 'rom_a' as RoomId;
const ROOM_B = 'rom_b' as RoomId;

function candidate(roomId: RoomId, dayOfWeek: WeekdayIndex, start: string, end: string): RoomSessionCandidate {
  return { roomId, dayOfWeek, start: start as TimeOfDay, end: end as TimeOfDay };
}

function ref(
  id: string,
  roomId: RoomId,
  dayOfWeek: WeekdayIndex,
  start: string,
  end: string,
): ScheduledSessionRef {
  return { id: id as EntityId, roomId, dayOfWeek, start: start as TimeOfDay, end: end as TimeOfDay };
}

// A Monday 10:00–11:00 session sitting in room A, the anchor most cases probe.
const existing: readonly ScheduledSessionRef[] = [ref('s1', ROOM_A, 1, '10:00', '11:00')];

describe('SessionConflictPolicy.roomConflict', () => {
  describe('accepted (returns null)', () => {
    it('allows a back-to-back session that starts exactly as the other ends', () => {
      expect(SessionConflictPolicy.roomConflict(candidate(ROOM_A, 1, '11:00', '12:00'), existing)).toBeNull();
    });

    it('allows a back-to-back session that ends exactly as the other starts', () => {
      expect(SessionConflictPolicy.roomConflict(candidate(ROOM_A, 1, '09:00', '10:00'), existing)).toBeNull();
    });

    it('ignores an overlapping session in a different room', () => {
      expect(SessionConflictPolicy.roomConflict(candidate(ROOM_B, 1, '10:00', '11:00'), existing)).toBeNull();
    });

    it('ignores an overlapping session on a different day', () => {
      expect(SessionConflictPolicy.roomConflict(candidate(ROOM_A, 2, '10:00', '11:00'), existing)).toBeNull();
    });

    it('returns null when there are no existing sessions', () => {
      expect(SessionConflictPolicy.roomConflict(candidate(ROOM_A, 1, '10:00', '11:00'), [])).toBeNull();
    });
  });

  describe('rejected (returns the error)', () => {
    it('flags a one-minute overlap at the end boundary', () => {
      const error = SessionConflictPolicy.roomConflict(candidate(ROOM_A, 1, '10:59', '11:30'), existing);
      expect(error).toBeInstanceOf(RoomConflictError);
      expect(error?.conflicts.map((c) => c.id)).toEqual(['s1']);
    });

    it('flags a one-minute overlap at the start boundary', () => {
      const error = SessionConflictPolicy.roomConflict(candidate(ROOM_A, 1, '09:30', '10:01'), existing);
      expect(error?.conflicts.map((c) => c.id)).toEqual(['s1']);
    });

    it('flags an exact same-slot session', () => {
      const error = SessionConflictPolicy.roomConflict(candidate(ROOM_A, 1, '10:00', '11:00'), existing);
      expect(error).toBeInstanceOf(RoomConflictError);
      expect(error?.conflicts).toHaveLength(1);
    });

    it('flags a candidate fully contained inside an existing session', () => {
      const error = SessionConflictPolicy.roomConflict(candidate(ROOM_A, 1, '10:15', '10:45'), existing);
      expect(error?.conflicts.map((c) => c.id)).toEqual(['s1']);
    });

    it('flags an existing session fully contained inside the candidate', () => {
      const inner: readonly ScheduledSessionRef[] = [ref('s2', ROOM_A, 1, '10:15', '10:45')];
      const error = SessionConflictPolicy.roomConflict(candidate(ROOM_A, 1, '09:00', '12:00'), inner);
      expect(error?.conflicts.map((c) => c.id)).toEqual(['s2']);
    });

    it('flags a partial overlap that starts before and ends inside', () => {
      const error = SessionConflictPolicy.roomConflict(candidate(ROOM_A, 1, '09:30', '10:30'), existing);
      expect(error?.conflicts.map((c) => c.id)).toEqual(['s1']);
    });

    it('carries the roomId and dayOfWeek of the candidate', () => {
      const error = SessionConflictPolicy.roomConflict(candidate(ROOM_A, 1, '10:00', '11:00'), existing);
      expect(error?.roomId).toBe(ROOM_A);
      expect(error?.dayOfWeek).toBe(1);
    });

    it('returns every overlapping session in the same room and day', () => {
      const many: readonly ScheduledSessionRef[] = [
        ref('s1', ROOM_A, 1, '10:00', '11:00'), // overlaps
        ref('s2', ROOM_A, 1, '10:30', '11:30'), // overlaps
        ref('s3', ROOM_A, 1, '12:00', '13:00'), // no overlap (after)
        ref('s4', ROOM_B, 1, '10:00', '11:00'), // other room
        ref('s5', ROOM_A, 2, '10:00', '11:00'), // other day
      ];
      const error = SessionConflictPolicy.roomConflict(candidate(ROOM_A, 1, '10:15', '11:15'), many);
      expect(error?.conflicts.map((c) => c.id)).toEqual(['s1', 's2']);
    });
  });
});
