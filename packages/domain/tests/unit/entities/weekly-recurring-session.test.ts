import { describe, it, expect } from 'vitest';
import {
  createWeeklyRecurringSession,
  toScheduledSessionRef,
  type WeeklyRecurringSession,
  type WeeklyRecurringSessionDraft,
  type WeeklyRecurringSessionId,
} from '../../../src/entities/weekly-recurring-session';
import {
  InvalidSessionValidityRangeError,
  MalformedSessionTimeError,
} from '../../../src/errors/scheduling-errors';
import type { EntityEnvelope } from '../../../src/entities/envelope';
import type { CenterCode, DeviceId, UserId, EntityId } from '../../../src/value-objects/ids';
import type { RoomId } from '../../../src/entities/room';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';

const envelope: EntityEnvelope = {
  centerCode: 'CS-CASA-001' as CenterCode,
  deviceOrigin: 'dev_01JBX3ZK9P7Q8R5V6W7X8Y9Z0B' as DeviceId,
  createdAt: new Date('2026-07-29T10:00:00Z'),
  updatedAt: new Date('2026-07-29T10:00:00Z'),
  updatedBy: 'usr_01JBX3ZK9P7Q8R5V6W7X8Y9Z0C' as UserId,
  deletedAt: null,
  version: 0,
};

const base: WeeklyRecurringSession = {
  id: 'wrs_01JBX3ZK9P7Q8R5V6W7X8Y9Z0A' as WeeklyRecurringSessionId,
  ...envelope,
  roomId: 'rom_01JBX3ZK9P7Q8R5V6W7X8Y9Z0D' as RoomId,
  teacherId: 'tch_01JBX3ZK9P7Q8R5V6W7X8Y9Z0E' as EntityId,
  groupId: null,
  dayOfWeek: 2 as WeekdayIndex,
  start: '09:00' as TimeOfDay,
  end: '10:30' as TimeOfDay,
  active: true,
  validFrom: null,
  validTo: null,
  conflictAccepted: false,
};

function draft(over: Partial<WeeklyRecurringSessionDraft> = {}): WeeklyRecurringSessionDraft {
  return {
    id: base.id,
    envelope,
    roomId: base.roomId,
    teacherId: base.teacherId,
    groupId: base.groupId,
    dayOfWeek: base.dayOfWeek,
    start: base.start,
    end: base.end,
    validFrom: null,
    validTo: null,
    ...over,
  };
}

describe('toScheduledSessionRef', () => {
  it('projects the placement fields and drops the envelope', () => {
    expect(toScheduledSessionRef(base)).toEqual({
      id: base.id,
      roomId: base.roomId,
      teacherId: base.teacherId,
      dayOfWeek: 2,
      start: '09:00',
      end: '10:30',
    });
  });

  it('omits teacherId entirely (not undefined) when the session has no teacher', () => {
    const ref = toScheduledSessionRef({ ...base, teacherId: null });
    expect(ref).not.toHaveProperty('teacherId');
    expect(ref).toEqual({
      id: base.id,
      roomId: base.roomId,
      dayOfWeek: 2,
      start: '09:00',
      end: '10:30',
    });
  });
});

describe('createWeeklyRecurringSession', () => {
  it('builds the entity, spreading the envelope and keeping the domain fields', () => {
    expect(createWeeklyRecurringSession(draft())).toEqual(base);
  });

  it('defaults active to true when omitted', () => {
    expect(createWeeklyRecurringSession(draft()).active).toBe(true);
  });

  it('keeps active false when explicitly paused', () => {
    expect(createWeeklyRecurringSession(draft({ active: false })).active).toBe(false);
  });

  it('defaults conflictAccepted to false when omitted', () => {
    expect(createWeeklyRecurringSession(draft()).conflictAccepted).toBe(false);
  });

  it('keeps conflictAccepted true when the block was forced past a conflict', () => {
    expect(createWeeklyRecurringSession(draft({ conflictAccepted: true })).conflictAccepted).toBe(
      true,
    );
  });

  it('carries both validity bounds through when set', () => {
    const session = createWeeklyRecurringSession(
      draft({ validFrom: '2026-09-01', validTo: '2027-06-30' }),
    );
    expect(session.validFrom).toBe('2026-09-01');
    expect(session.validTo).toBe('2027-06-30');
  });

  describe('invariant: start < end', () => {
    it('accepts a well-formed positive-duration slot', () => {
      expect(() => createWeeklyRecurringSession(draft())).not.toThrow();
    });

    it('rejects a backwards slot (end before start)', () => {
      expect(() =>
        createWeeklyRecurringSession(
          draft({ start: '10:30' as TimeOfDay, end: '09:00' as TimeOfDay }),
        ),
      ).toThrow(MalformedSessionTimeError);
    });

    it('rejects a zero-length slot (end equal to start)', () => {
      expect(() =>
        createWeeklyRecurringSession(
          draft({ start: '09:00' as TimeOfDay, end: '09:00' as TimeOfDay }),
        ),
      ).toThrow(MalformedSessionTimeError);
    });
  });

  describe('invariant: validFrom <= validTo', () => {
    it('accepts a forward window', () => {
      expect(() =>
        createWeeklyRecurringSession(draft({ validFrom: '2026-09-01', validTo: '2027-06-30' })),
      ).not.toThrow();
    });

    it('accepts an equal (single-day) window', () => {
      expect(() =>
        createWeeklyRecurringSession(draft({ validFrom: '2026-09-01', validTo: '2026-09-01' })),
      ).not.toThrow();
    });

    it('rejects an inverted window', () => {
      expect(() =>
        createWeeklyRecurringSession(draft({ validFrom: '2027-06-30', validTo: '2026-09-01' })),
      ).toThrow(InvalidSessionValidityRangeError);
    });

    it('allows an unbounded window (either bound null) without ordering check', () => {
      expect(() =>
        createWeeklyRecurringSession(draft({ validFrom: '2027-06-30', validTo: null })),
      ).not.toThrow();
      expect(() =>
        createWeeklyRecurringSession(draft({ validFrom: null, validTo: '2026-09-01' })),
      ).not.toThrow();
    });
  });
});
