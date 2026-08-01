import { describe, it, expect } from 'vitest';
import {
  weeklyRecurringSessionInputSchema,
  weeklyRecurringSessionUpdateSchema,
} from '../../../src/schemas/weekly-recurring-session';

/** The first error code emitted for an input, or null when it validates. */
function codeFor(input: unknown): string | null {
  const result = weeklyRecurringSessionInputSchema.safeParse(input);
  return result.success ? null : (result.error.issues[0]?.message ?? '');
}

const minimal = {
  roomId: 'rom_00000000000000000000000001',
  dayOfWeek: 1,
  start: '09:00',
  end: '10:30',
};

describe('weeklyRecurringSessionInputSchema', () => {
  describe('defaults (kickoff: group/teacher optional, validity defaults-only)', () => {
    it('fills teacherId/groupId/validFrom/validTo with null and active with true when omitted', () => {
      const result = weeklyRecurringSessionInputSchema.safeParse(minimal);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.teacherId).toBeNull();
        expect(result.data.groupId).toBeNull();
        expect(result.data.validFrom).toBeNull();
        expect(result.data.validTo).toBeNull();
        expect(result.data.active).toBe(true);
      }
    });

    it('accepts explicit teacher, group, validity window, and active flag', () => {
      const result = weeklyRecurringSessionInputSchema.safeParse({
        ...minimal,
        teacherId: 'tch_00000000000000000000000001',
        groupId: 'grp_00000000000000000000000001',
        validFrom: '2026-09-01',
        validTo: '2027-06-30',
        active: false,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('shape validation (ordering invariants live in the domain, not here)', () => {
    it('rejects a room id with the wrong prefix', () => {
      expect(codeFor({ ...minimal, roomId: 'xxx_1' })).toBe('invalid-id');
    });

    it('rejects a teacher id with the wrong prefix', () => {
      expect(codeFor({ ...minimal, teacherId: 'rom_00000000000000000000000001' })).toBe('invalid-id');
    });

    it('rejects a group id with the wrong prefix', () => {
      expect(codeFor({ ...minimal, groupId: 'rom_00000000000000000000000001' })).toBe('invalid-id');
    });

    it('rejects a malformed time', () => {
      expect(codeFor({ ...minimal, start: '9h' })).toBe('invalid-time');
    });

    it('rejects a weekday outside 0..6', () => {
      expect(codeFor({ ...minimal, dayOfWeek: 7 })).toBe('invalid-weekday');
    });

    it('rejects a malformed validity date', () => {
      expect(codeFor({ ...minimal, validFrom: '2026-13-40' })).toBe('invalid-date');
    });

    it('accepts a backwards time range (malformed-time is the factory/policy job, not the schema)', () => {
      expect(codeFor({ ...minimal, start: '11:00', end: '10:00' })).toBeNull();
    });
  });
});

describe('weeklyRecurringSessionUpdateSchema', () => {
  it('additionally requires a wrs_ id', () => {
    expect(
      weeklyRecurringSessionUpdateSchema.safeParse({
        ...minimal,
        id: 'wrs_00000000000000000000000001',
      }).success,
    ).toBe(true);
    expect(
      weeklyRecurringSessionUpdateSchema.safeParse({ ...minimal, id: 'rom_1' }).success,
    ).toBe(false);
  });
});
