import { describe, it, expect } from 'vitest';
import { newEnvelope } from '../../../src/entities/envelope';
import {
  ATTENDANCE_STATUSES,
  type AttendanceRecord,
  type AttendanceRecordId,
  type AttendanceStatus,
} from '../../../src/entities/attendance-record';
import type { SessionId } from '../../../src/entities/session';
import type { StudentId } from '../../../src/entities/student';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const SESSION_ID = 'ses_00000000000000000000000001' as SessionId;
const STUDENT_ID = 'stu_00000000000000000000000001' as StudentId;
const clock = fakeClock('2026-01-01T00:00:00Z');

function base(): AttendanceRecord {
  return {
    id: 'att_00000000000000000000000001' as AttendanceRecordId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock),
    sessionId: SESSION_ID,
    studentId: STUDENT_ID,
    status: 'present',
    note: null,
  };
}

/**
 * Exhaustive switch over `status` — compiles only because the union is closed
 * to exactly the four members of {@link ATTENDANCE_STATUSES}. A fifth status
 * added to the type without updating this function fails the build here.
 */
function labelFor(status: AttendanceStatus): string {
  switch (status) {
    case 'present':
      return 'Présent';
    case 'absent':
      return 'Absent';
    case 'excused':
      return 'Excusé';
    case 'late':
      return 'En retard';
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

describe('AttendanceRecord', () => {
  it('constructs a record with the standard envelope', () => {
    const record = base();
    expect(record.createdAt).toEqual(record.updatedAt);
    expect(record.deletedAt).toBeNull();
    expect(record.version).toBe(0);
  });

  it.each(ATTENDANCE_STATUSES)('accepts status %s', (status) => {
    const record: AttendanceRecord = { ...base(), status };
    expect(labelFor(record.status)).not.toBe('');
  });

  it('carries no naturalKey — not people-like', () => {
    expect('naturalKey' in base()).toBe(false);
  });

  it('allows a null note', () => {
    expect(base().note).toBeNull();
  });

  it('allows a free-form note', () => {
    const record: AttendanceRecord = { ...base(), note: "Arrivé avec 10 min de retard" };
    expect(record.note).toBe("Arrivé avec 10 min de retard");
  });
});
