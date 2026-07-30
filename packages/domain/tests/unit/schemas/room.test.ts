import { describe, it, expect } from 'vitest';
import { roomInputSchema } from '../../../src/schemas/room';

/** The single error code emitted for an input, or null when it validates. */
function codeFor(input: unknown): string | null {
  const result = roomInputSchema.safeParse(input);
  return result.success ? null : (result.error.issues[0]?.message ?? '');
}

describe('roomInputSchema', () => {
  describe('happy path', () => {
    it('accepts a name + integer capacity ≥ 1 and trims the name', () => {
      const result = roomInputSchema.safeParse({ name: '  Salle A  ', capacity: 20 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Salle A');
        expect(result.data.capacity).toBe(20);
      }
    });
  });

  describe('name', () => {
    it('rejects a blank name with "required"', () => {
      expect(codeFor({ name: '   ', capacity: 5 })).toBe('required');
    });

    it('rejects an over-long name with "too-long"', () => {
      expect(codeFor({ name: 'x'.repeat(81), capacity: 5 })).toBe('too-long');
    });
  });

  describe('capacity', () => {
    it('maps an empty field (NaN) to "not-an-integer", not Zod\'s default message', () => {
      // The form seeds an empty capacity as NaN (EMPTY_ROOM_INPUT); the base-type
      // error must be the localizable code, never the raw "Invalid input" string.
      expect(codeFor({ name: 'Salle A', capacity: Number.NaN })).toBe('not-an-integer');
    });

    it('maps a missing/undefined capacity to "not-an-integer"', () => {
      expect(codeFor({ name: 'Salle A' })).toBe('not-an-integer');
    });

    it('rejects a non-integer with "not-an-integer"', () => {
      expect(codeFor({ name: 'Salle A', capacity: 2.5 })).toBe('not-an-integer');
    });

    it('rejects zero with "capacity-too-small"', () => {
      expect(codeFor({ name: 'Salle A', capacity: 0 })).toBe('capacity-too-small');
    });

    it('rejects a negative capacity with "capacity-too-small"', () => {
      expect(codeFor({ name: 'Salle A', capacity: -3 })).toBe('capacity-too-small');
    });
  });
});
