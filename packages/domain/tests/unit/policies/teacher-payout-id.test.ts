import { describe, it, expect } from 'vitest';
import { deriveTeacherPayoutId } from '../../../src/policies/teacher-payout-id';
import { TEACHER_PAYOUT_ID_PREFIX } from '../../../src/entities/teacher-payout';
import type { CenterCode } from '../../../src/value-objects/ids';
import type { TeacherId } from '../../../src/entities/teacher';

const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-002' as CenterCode;
const TEACHER = 'tch_00000000000000000000000001' as TeacherId;
const OTHER_TEACHER = 'tch_00000000000000000000000002' as TeacherId;

describe('deriveTeacherPayoutId', () => {
  it('is a pure function: the same (centerCode, teacherId, month) always yields the same id', () => {
    const first = deriveTeacherPayoutId(CENTER, TEACHER, '2026-08');
    const second = deriveTeacherPayoutId(CENTER, TEACHER, '2026-08');
    expect(first).toBe(second);
  });

  it('matches the entity id-prefix shape', () => {
    const id = deriveTeacherPayoutId(CENTER, TEACHER, '2026-08');
    expect(id.startsWith(`${TEACHER_PAYOUT_ID_PREFIX}_`)).toBe(true);
  });

  it('differs when the teacher differs', () => {
    expect(deriveTeacherPayoutId(CENTER, TEACHER, '2026-08')).not.toBe(
      deriveTeacherPayoutId(CENTER, OTHER_TEACHER, '2026-08'),
    );
  });

  it('differs when the month differs', () => {
    expect(deriveTeacherPayoutId(CENTER, TEACHER, '2026-08')).not.toBe(
      deriveTeacherPayoutId(CENTER, TEACHER, '2026-09'),
    );
  });

  it('differs when the center differs — never mixes two centers into one id', () => {
    expect(deriveTeacherPayoutId(CENTER, TEACHER, '2026-08')).not.toBe(
      deriveTeacherPayoutId(OTHER_CENTER, TEACHER, '2026-08'),
    );
  });
});
