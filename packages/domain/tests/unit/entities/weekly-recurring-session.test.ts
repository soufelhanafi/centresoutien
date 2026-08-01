import { describe, it, expect } from 'vitest';
import {
  toScheduledSessionRef,
  type WeeklyRecurringSession,
  type WeeklyRecurringSessionId,
} from '../../../src/entities/weekly-recurring-session';
import type { CenterCode, DeviceId, UserId, EntityId } from '../../../src/value-objects/ids';
import type { RoomId } from '../../../src/entities/room';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';

const base: WeeklyRecurringSession = {
  id: 'wrs_01JBX3ZK9P7Q8R5V6W7X8Y9Z0A' as WeeklyRecurringSessionId,
  centerCode: 'CS-CASA-001' as CenterCode,
  deviceOrigin: 'dev_01JBX3ZK9P7Q8R5V6W7X8Y9Z0B' as DeviceId,
  createdAt: new Date('2026-07-29T10:00:00Z'),
  updatedAt: new Date('2026-07-29T10:00:00Z'),
  updatedBy: 'usr_01JBX3ZK9P7Q8R5V6W7X8Y9Z0C' as UserId,
  deletedAt: null,
  version: 0,
  roomId: 'rom_01JBX3ZK9P7Q8R5V6W7X8Y9Z0D' as RoomId,
  teacherId: 'tch_01JBX3ZK9P7Q8R5V6W7X8Y9Z0E' as EntityId,
  groupId: null,
  dayOfWeek: 2 as WeekdayIndex,
  start: '09:00' as TimeOfDay,
  end: '10:30' as TimeOfDay,
};

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
