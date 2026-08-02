import { describe, expect, it } from 'vitest';
import {
  sessionFormSchema,
  toSessionInput,
  type SessionFormValues,
} from '../../../src/renderer/lib/planning/session-form-schema';

/** Collects the issue messages (stable error codes) keyed by field. */
function codes(input: unknown): Record<string, string | undefined> {
  const result = sessionFormSchema.safeParse(input);
  if (result.success) return {};
  const out: Record<string, string> = {};
  for (const issue of result.error.issues) out[issue.path.join('.') || '_'] = issue.message;
  return out;
}

const VALID = {
  dayOfWeek: '1',
  start: '09:00',
  end: '10:30',
  roomId: 'rom_0001',
  teacherId: null,
  groupId: null,
};

describe('sessionFormSchema', () => {
  it('accepts a well-formed session and keeps the weekday a string', () => {
    const result = sessionFormSchema.safeParse(VALID);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.dayOfWeek).toBe('1');
  });

  it('defaults an omitted teacher and group to null (both optional)', () => {
    const result = sessionFormSchema.safeParse({
      dayOfWeek: '2',
      start: '08:00',
      end: '09:00',
      roomId: 'rom_0001',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.teacherId).toBeNull();
      expect(result.data.groupId).toBeNull();
    }
  });

  it('requires a room', () => {
    expect(codes({ ...VALID, roomId: '' }).roomId).toBe('required');
  });

  it('flags a blank start and end time', () => {
    const result = codes({ ...VALID, start: '', end: '' });
    expect(result.start).toBeDefined();
    expect(result.end).toBeDefined();
  });

  it('rejects a malformed time value', () => {
    expect(codes({ ...VALID, start: '99:99' }).start).toBe('invalid-time');
  });

  it('rejects an end that is not strictly after the start', () => {
    expect(codes({ ...VALID, start: '10:00', end: '09:00' }).end).toBe('malformed-session-time');
    expect(codes({ ...VALID, start: '10:00', end: '10:00' }).end).toBe('malformed-session-time');
  });
});

describe('toSessionInput', () => {
  it('narrows the string weekday to the numeric contract value', () => {
    const values = { ...VALID, dayOfWeek: '3' } as SessionFormValues;
    expect(toSessionInput(values)).toEqual({
      roomId: 'rom_0001',
      teacherId: null,
      groupId: null,
      dayOfWeek: 3,
      start: '09:00',
      end: '10:30',
    });
  });
});
