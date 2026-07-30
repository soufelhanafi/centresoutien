import { describe, it, expect } from 'vitest';
import { detectSessionConflicts } from '../../../src/policies/composite-session-conflicts';
import type {
  CompositeSessionCandidate,
  ConflictCheckContext,
} from '../../../src/policies/composite-session-conflicts';
import type { DayHours } from '../../../src/policies/session-conflict-policy';
import type { ScheduledSessionRef } from '../../../src/errors/scheduling-errors';
import type { CenterCode, EntityId } from '../../../src/value-objects/ids';
import type { RoomId } from '../../../src/entities/room';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';

const ROOM_A = 'rom_a' as RoomId;
const ROOM_B = 'rom_b' as RoomId;
const TEACHER_A = 'tch_a' as EntityId;

// Open Mon–Sat 09:00–18:00, Sunday (0) closed.
const week: readonly DayHours[] = [
  { dayOfWeek: 0, open: null, close: null },
  { dayOfWeek: 1, open: '09:00' as TimeOfDay, close: '18:00' as TimeOfDay },
  { dayOfWeek: 2, open: '09:00' as TimeOfDay, close: '18:00' as TimeOfDay },
  { dayOfWeek: 3, open: '09:00' as TimeOfDay, close: '18:00' as TimeOfDay },
  { dayOfWeek: 4, open: '09:00' as TimeOfDay, close: '18:00' as TimeOfDay },
  { dayOfWeek: 5, open: '09:00' as TimeOfDay, close: '18:00' as TimeOfDay },
  { dayOfWeek: 6, open: '09:00' as TimeOfDay, close: '18:00' as TimeOfDay },
];

function candidate(
  overrides: Partial<CompositeSessionCandidate> = {},
): CompositeSessionCandidate {
  return {
    roomId: ROOM_A,
    teacherId: TEACHER_A,
    dayOfWeek: 1,
    start: '10:00' as TimeOfDay,
    end: '11:00' as TimeOfDay,
    ...overrides,
  };
}

function ref(
  id: string,
  roomId: RoomId,
  teacherId: EntityId | undefined,
  start: string,
  end: string,
): ScheduledSessionRef {
  return {
    id: id as EntityId,
    roomId,
    ...(teacherId !== undefined ? { teacherId } : {}),
    dayOfWeek: 1,
    start: start as TimeOfDay,
    end: end as TimeOfDay,
  };
}

function context(existing: readonly ScheduledSessionRef[]): ConflictCheckContext {
  return { existing, week };
}

describe('detectSessionConflicts', () => {
  it('returns an empty list when the slot is free and in hours', () => {
    expect(detectSessionConflicts(candidate(), context([]))).toEqual([]);
  });

  it('reports a room overlap', () => {
    const result = detectSessionConflicts(
      candidate({ teacherId: undefined }),
      context([ref('s1', ROOM_A, undefined, '10:30', '11:30')]),
    );
    expect(result.map((c) => c.kind)).toEqual(['room']);
    expect(result[0]?.severity).toBe('error');
  });

  it('reports a teacher overlap when the candidate books a teacher', () => {
    const result = detectSessionConflicts(
      candidate(),
      context([ref('s1', ROOM_B, TEACHER_A, '10:30', '11:30')]), // different room, same teacher
    );
    expect(result.map((c) => c.kind)).toEqual(['teacher']);
  });

  it('never reports a teacher overlap when the candidate has no teacher', () => {
    const result = detectSessionConflicts(
      candidate({ teacherId: undefined }),
      context([ref('s1', ROOM_B, TEACHER_A, '10:30', '11:30')]),
    );
    expect(result).toEqual([]);
  });

  describe('out-of-hours (all three reasons)', () => {
    it('flags a closed day', () => {
      const result = detectSessionConflicts(candidate({ dayOfWeek: 0 }), context([]));
      expect(result.map((c) => c.kind)).toEqual(['hours']);
      expect(result[0]?.kind === 'hours' && result[0].error.reason).toBe('closed');
    });

    it('flags a start before open', () => {
      const result = detectSessionConflicts(
        candidate({ start: '08:30' as TimeOfDay, end: '09:30' as TimeOfDay }),
        context([]),
      );
      expect(result[0]?.kind === 'hours' && result[0].error.reason).toBe('before-open');
    });

    it('flags an end after close', () => {
      const result = detectSessionConflicts(
        candidate({ start: '17:30' as TimeOfDay, end: '18:30' as TimeOfDay }),
        context([]),
      );
      expect(result[0]?.kind === 'hours' && result[0].error.reason).toBe('after-close');
    });
  });

  it('aggregates hours + room + teacher conflicts in one pass, most-blocking order', () => {
    const result = detectSessionConflicts(
      candidate({ start: '17:30' as TimeOfDay, end: '18:30' as TimeOfDay }), // after close
      context([
        ref('r1', ROOM_A, undefined, '17:00', '18:00'), // room clash
        ref('t1', ROOM_B, TEACHER_A, '17:00', '18:00'), // teacher clash
      ]),
    );
    expect(result.map((c) => c.kind)).toEqual(['hours', 'room', 'teacher']);
  });

  describe('malformed candidate short-circuits', () => {
    it('reports only the malformed conflict for a backwards slot, even inside hours', () => {
      const result = detectSessionConflicts(
        candidate({ start: '11:00' as TimeOfDay, end: '10:00' as TimeOfDay }),
        context([ref('s1', ROOM_A, TEACHER_A, '10:00', '11:00')]),
      );
      expect(result.map((c) => c.kind)).toEqual(['malformed']);
    });

    it('reports malformed for a zero-length slot', () => {
      const result = detectSessionConflicts(
        candidate({ start: '10:00' as TimeOfDay, end: '10:00' as TimeOfDay }),
        context([]),
      );
      expect(result.map((c) => c.kind)).toEqual(['malformed']);
    });
  });

  // A ref from another center must never surface as a conflict. The policy is
  // tenant-blind by design (ScheduledSessionRef carries no centerCode), so the
  // caller scopes to same-center refs before calling in. This pins that the
  // scoping happens at the boundary and a cross-center leak can't slip through.
  describe('cross-center scoping (caller boundary)', () => {
    const THIS_CENTER = 'CS-CASA-001' as CenterCode;
    const OTHER_CENTER = 'CS-CASA-002' as CenterCode;

    // Same room, same overlapping slot — the only thing that differs is center.
    const otherCenterRef = ref('other', ROOM_A, TEACHER_A, '10:00', '11:00');
    const centerOf = new Map<ScheduledSessionRef, CenterCode>([[otherCenterRef, OTHER_CENTER]]);
    const scopeTo = (center: CenterCode, refs: readonly ScheduledSessionRef[]) =>
      refs.filter((r) => centerOf.get(r) === center);

    it('does not report a conflict once the other-center ref is scoped out', () => {
      const scoped = scopeTo(THIS_CENTER, [otherCenterRef]);
      expect(detectSessionConflicts(candidate(), context(scoped))).toEqual([]);
    });

    it('would conflict if that same ref leaked in unscoped — proving scoping is load-bearing', () => {
      const leaked = detectSessionConflicts(candidate(), context([otherCenterRef]));
      expect(leaked.map((c) => c.kind)).toEqual(['room', 'teacher']);
    });
  });
});
