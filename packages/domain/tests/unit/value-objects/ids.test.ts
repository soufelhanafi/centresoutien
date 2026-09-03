import { describe, expect, it } from 'vitest';
import { isUlid, hasIdPrefix, hasDeterministicIdPrefix, ULID_REGEX } from '../../../src/value-objects/ids';

describe('isUlid', () => {
  it('accepts a canonical 26-char Crockford ULID', () => {
    expect(isUlid('01HW0000000000000000000000')).toBe(true);
    expect(isUlid('01JBX3ZK9P7Q8R5V6W7X8Y9Z0A')).toBe(true);
  });

  it('rejects wrong length, lowercase, and the excluded letters I L O U', () => {
    expect(isUlid('')).toBe(false);
    expect(isUlid('01HW00000000000000000000')).toBe(false); // 24 chars
    expect(isUlid('01hw0000000000000000000000')).toBe(false); // lowercase
    expect(isUlid('01HW00000000000000000000IL')).toBe(false); // I, L not allowed
  });

  it('rejects a value that still carries an entity prefix', () => {
    expect(isUlid('stu_01JBX3ZK9P7Q8R5V6W7X8Y9Z0A')).toBe(false);
  });
});

describe('hasIdPrefix', () => {
  it('is true only when the prefix matches and the remainder is a ULID', () => {
    expect(hasIdPrefix('stu_01JBX3ZK9P7Q8R5V6W7X8Y9Z0A', 'stu')).toBe(true);
    expect(hasIdPrefix('tch_01JBX3ZK9P7Q8R5V6W7X8Y9Z0A', 'stu')).toBe(false);
    expect(hasIdPrefix('stu_not-a-ulid', 'stu')).toBe(false);
    expect(hasIdPrefix('01JBX3ZK9P7Q8R5V6W7X8Y9Z0A', 'stu')).toBe(false);
  });
});

describe('hasDeterministicIdPrefix', () => {
  it('is true whenever the prefix matches, regardless of what follows — no ULID requirement', () => {
    expect(hasDeterministicIdPrefix('inv_CS-CASA-001_stu_01JBX3ZK9P7Q8R5V6W7X8Y9Z0A_2026-09', 'inv')).toBe(
      true,
    );
    expect(hasDeterministicIdPrefix('inv_01JBX3ZK9P7Q8R5V6W7X8Y9Z0A', 'inv')).toBe(true); // still accepts a ULID suffix
    expect(hasDeterministicIdPrefix('invl_CS-CASA-001', 'inv')).toBe(false); // 'inv' is not a prefix of 'invl_'
  });

  it('is false when the prefix does not match', () => {
    expect(hasDeterministicIdPrefix('pyo_CS-CASA-001_tch_01JBX3ZK9P7Q8R5V6W7X8Y9Z0A_2026-08', 'inv')).toBe(
      false,
    );
  });
});

describe('ULID_REGEX', () => {
  it('is anchored (no partial matches)', () => {
    expect(ULID_REGEX.test('xx01JBX3ZK9P7Q8R5V6W7X8Y9Z0Axx')).toBe(false);
  });
});
