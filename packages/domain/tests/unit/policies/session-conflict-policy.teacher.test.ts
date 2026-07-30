import { describe, it, expect } from 'vitest';
import { SessionConflictPolicy } from '../../../src/policies/session-conflict-policy';
import {
  MalformedSessionTimeError,
  TeacherConflictError,
} from '../../../src/errors/scheduling-errors';
import type { ScheduledSessionRef } from '../../../src/errors/scheduling-errors';
import type {
  SessionTimeCandidate,
  TeacherSessionCandidate,
} from '../../../src/policies/session-conflict-policy';
import type { EntityId } from '../../../src/value-objects/ids';
import type { RoomId } from '../../../src/entities/room';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';

// Two teachers and the room the refs sit in (room is irrelevant to this check).
const TEACHER_A = 'tch_a' as EntityId;
const TEACHER_B = 'tch_b' as EntityId;
const ROOM = 'rom_x' as RoomId;

function candidate(
  teacherId: EntityId,
  dayOfWeek: WeekdayIndex,
  start: string,
  end: string,
): TeacherSessionCandidate {
  return { teacherId, dayOfWeek, start: start as TimeOfDay, end: end as TimeOfDay };
}

function ref(
  id: string,
  teacherId: EntityId | undefined,
  dayOfWeek: WeekdayIndex,
  start: string,
  end: string,
): ScheduledSessionRef {
  return {
    id: id as EntityId,
    roomId: ROOM,
    ...(teacherId !== undefined ? { teacherId } : {}),
    dayOfWeek,
    start: start as TimeOfDay,
    end: end as TimeOfDay,
  };
}

// Teacher A teaches Monday 10:00–11:00 — the anchor most cases probe.
const existing: readonly ScheduledSessionRef[] = [ref('s1', TEACHER_A, 1, '10:00', '11:00')];

describe('SessionConflictPolicy.teacherConflict', () => {
  describe('accepted (returns null)', () => {
    it('allows a back-to-back session that starts exactly as the other ends', () => {
      expect(SessionConflictPolicy.teacherConflict(candidate(TEACHER_A, 1, '11:00', '12:00'), existing)).toBeNull();
    });

    it('ignores an overlapping session booked for a different teacher', () => {
      expect(SessionConflictPolicy.teacherConflict(candidate(TEACHER_B, 1, '10:00', '11:00'), existing)).toBeNull();
    });

    it('ignores an overlapping session on a different day', () => {
      expect(SessionConflictPolicy.teacherConflict(candidate(TEACHER_A, 2, '10:00', '11:00'), existing)).toBeNull();
    });

    it('skips refs that have no teacher assigned', () => {
      const teacherless: readonly ScheduledSessionRef[] = [ref('s2', undefined, 1, '10:00', '11:00')];
      expect(SessionConflictPolicy.teacherConflict(candidate(TEACHER_A, 1, '10:00', '11:00'), teacherless)).toBeNull();
    });

    it('returns null when there are no existing sessions', () => {
      expect(SessionConflictPolicy.teacherConflict(candidate(TEACHER_A, 1, '10:00', '11:00'), [])).toBeNull();
    });
  });

  describe('rejected (returns the error)', () => {
    it('flags an exact same-slot session', () => {
      const error = SessionConflictPolicy.teacherConflict(candidate(TEACHER_A, 1, '10:00', '11:00'), existing);
      expect(error).toBeInstanceOf(TeacherConflictError);
      expect(error?.teacherId).toBe(TEACHER_A);
      expect(error?.dayOfWeek).toBe(1);
      expect(error?.conflicts.map((c) => c.id)).toEqual(['s1']);
    });

    it('flags a one-minute overlap at the start boundary', () => {
      const error = SessionConflictPolicy.teacherConflict(candidate(TEACHER_A, 1, '09:30', '10:01'), existing);
      expect(error?.conflicts.map((c) => c.id)).toEqual(['s1']);
    });

    it('returns every overlapping session for the same teacher and day', () => {
      const many: readonly ScheduledSessionRef[] = [
        ref('s1', TEACHER_A, 1, '10:00', '11:00'), // overlaps
        ref('s2', TEACHER_A, 1, '10:30', '11:30'), // overlaps
        ref('s3', TEACHER_A, 1, '12:00', '13:00'), // no overlap (after)
        ref('s4', TEACHER_B, 1, '10:00', '11:00'), // other teacher
        ref('s5', TEACHER_A, 2, '10:00', '11:00'), // other day
        ref('s6', undefined, 1, '10:00', '11:00'), // no teacher
      ];
      const error = SessionConflictPolicy.teacherConflict(candidate(TEACHER_A, 1, '10:15', '11:15'), many);
      expect(error?.conflicts.map((c) => c.id)).toEqual(['s1', 's2']);
    });
  });
});

function timeCandidate(dayOfWeek: WeekdayIndex, start: string, end: string): SessionTimeCandidate {
  return { dayOfWeek, start: start as TimeOfDay, end: end as TimeOfDay };
}

describe('SessionConflictPolicy.wellFormed', () => {
  it('accepts a positive-duration slot', () => {
    expect(SessionConflictPolicy.wellFormed(timeCandidate(1, '10:00', '11:00'))).toBeNull();
  });

  it('rejects a backwards slot (end before start)', () => {
    const error = SessionConflictPolicy.wellFormed(timeCandidate(1, '11:00', '10:00'));
    expect(error).toBeInstanceOf(MalformedSessionTimeError);
    expect(error?.start).toBe('11:00');
    expect(error?.end).toBe('10:00');
    expect(error?.dayOfWeek).toBe(1);
  });

  it('rejects a zero-length slot (end equal to start)', () => {
    const error = SessionConflictPolicy.wellFormed(timeCandidate(1, '10:00', '10:00'));
    expect(error).toBeInstanceOf(MalformedSessionTimeError);
  });
});
