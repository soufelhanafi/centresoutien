import { describe, it, expect } from 'vitest';
import {
  isSubscriptionActiveInMonth,
  subscriptionRangesOverlap,
  findActiveCoverage,
} from '../../../src/policies/student-subscription-policy';
import { newEnvelope } from '../../../src/entities/envelope';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';
import type {
  StudentSubscription,
  StudentSubscriptionId,
  FormulaId,
} from '../../../src/entities/student-subscription';
import type { StudentId } from '../../../src/entities/student';
import type { SubjectId } from '../../../src/entities/subject';
import type { GroupKind } from '../../../src/entities/group';
import { fakeClock } from '../fakes/clock';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const STUDENT_ID = 'stu_00000000000000000000000001' as StudentId;
const MATH = 'sub_00000000000000000000000003' as SubjectId;
const PHYS = 'sub_00000000000000000000000004' as SubjectId;
const SVT = 'sub_00000000000000000000000005' as SubjectId;

const clock = fakeClock('2026-01-01T00:00:00Z');
let seq = 0;

function sub(
  startMonth: string,
  endMonth: string | null,
  subjectIds: readonly SubjectId[],
  kind: GroupKind = 'regular',
): StudentSubscription {
  seq += 1;
  return {
    id: `sbs_${String(seq).padStart(26, '0')}` as StudentSubscriptionId,
    ...newEnvelope({ centerCode: CENTER, deviceOrigin: DEVICE, updatedBy: USER }, clock),
    studentId: STUDENT_ID,
    formulaId: 'fml_00000000000000000000000002' as FormulaId,
    kind,
    subjectIds,
    startMonth,
    endMonth,
  };
}

describe('isSubscriptionActiveInMonth', () => {
  const cases = [
    { name: 'before start → inactive', start: '2026-09', end: '2026-12', month: '2026-08', expected: false },
    { name: 'on start → active', start: '2026-09', end: '2026-12', month: '2026-09', expected: true },
    { name: 'mid range → active', start: '2026-09', end: '2026-12', month: '2026-11', expected: true },
    { name: 'on end → active', start: '2026-09', end: '2026-12', month: '2026-12', expected: true },
    { name: 'after end → inactive', start: '2026-09', end: '2026-12', month: '2027-01', expected: false },
    { name: 'open-ended, far future → active', start: '2026-09', end: null, month: '2099-01', expected: true },
    { name: 'open-ended, before start → inactive', start: '2026-09', end: null, month: '2026-08', expected: false },
  ] as const;

  it.each(cases)('$name', ({ start, end, month, expected }) => {
    expect(isSubscriptionActiveInMonth({ startMonth: start, endMonth: end }, month)).toBe(expected);
  });
});

describe('subscriptionRangesOverlap', () => {
  const cases = [
    { name: 'adjacent, no gap month, no overlap', aS: '2026-09', aE: '2026-12', bS: '2027-01', bE: null, expected: false },
    { name: 'same month single overlap', aS: '2026-12', aE: '2026-12', bS: '2026-12', bE: '2027-06', expected: true },
    { name: 'contained', aS: '2026-09', aE: '2027-06', bS: '2026-11', bE: '2026-12', expected: true },
    { name: 'both open-ended overlap', aS: '2026-09', aE: null, bS: '2027-01', bE: null, expected: true },
    { name: 'open-ended a vs later bounded b', aS: '2026-09', aE: null, bS: '2027-01', bE: '2027-06', expected: true },
    { name: 'disjoint bounded', aS: '2026-09', aE: '2026-10', bS: '2026-12', bE: '2027-02', expected: false },
    // Empty (inverted) ranges — a zero-month full cancellation — cover no month, so
    // they never overlap, even against a range that would otherwise engulf them.
    { name: 'empty b (end before start) never overlaps', aS: '2026-01', aE: null, bS: '2026-09', bE: '2026-08', expected: false },
    { name: 'empty a (end before start) never overlaps', aS: '2026-09', aE: '2026-08', bS: '2026-01', bE: null, expected: false },
  ] as const;

  it.each(cases)('$name', ({ aS, aE, bS, bE, expected }) => {
    expect(subscriptionRangesOverlap(aS, aE, bS, bE)).toBe(expected);
  });
});

describe('findActiveCoverage (backs activeCoverage)', () => {
  it('returns the covering subscription kind when a live subscription includes the subject in the month', () => {
    const subs = [sub('2026-09', null, [MATH, PHYS], 'regular')];
    expect(findActiveCoverage(subs, MATH, '2026-10')).toEqual({ kind: 'regular' });
  });

  it('returns the exam-prep kind when the covering subscription is exam-prep', () => {
    const subs = [sub('2026-09', null, [MATH], 'exam-prep')];
    expect(findActiveCoverage(subs, MATH, '2026-10')).toEqual({ kind: 'exam-prep' });
  });

  it('returns null when no live subscription covers the subject', () => {
    const subs = [sub('2026-09', null, [MATH, PHYS], 'regular')];
    expect(findActiveCoverage(subs, SVT, '2026-10')).toBeNull();
  });

  it('returns null when the covering subscription is not active in the month', () => {
    const subs = [sub('2026-09', '2026-12', [MATH], 'regular')];
    expect(findActiveCoverage(subs, MATH, '2027-03')).toBeNull();
  });

  it('returns null for an empty set of subscriptions', () => {
    expect(findActiveCoverage([], MATH, '2026-10')).toBeNull();
  });

  it('does not count a cancelled (inverted-range) subscription as covering', () => {
    const subs = [sub('2026-09', '2026-08', [MATH], 'regular')]; // end before start → covers nothing
    expect(findActiveCoverage(subs, MATH, '2026-09')).toBeNull();
  });

  describe('prefer-kind (subject covered by both tracks)', () => {
    // Ordered so the exam-prep bundle sorts FIRST by start month — proves the result
    // no longer depends on ordering once preferKind is supplied.
    const both = [
      sub('2026-09', null, [MATH], 'exam-prep'),
      sub('2026-10', null, [MATH, PHYS], 'regular'),
    ];

    it('returns the regular kind when regular is preferred', () => {
      expect(findActiveCoverage(both, MATH, '2026-11', 'regular')).toEqual({ kind: 'regular' });
    });

    it('returns the exam-prep kind when exam-prep is preferred', () => {
      expect(findActiveCoverage(both, MATH, '2026-11', 'exam-prep')).toEqual({ kind: 'exam-prep' });
    });

    it('falls back to the first covering subscription when the preferred kind does not cover the subject', () => {
      // Only a regular subscription covers MATH; preferring exam-prep still returns
      // the (wrong) regular kind — so EnrollStudent trips CrossKindEnrollmentError,
      // not the missing-subscription error.
      const regularOnly = [sub('2026-09', null, [MATH], 'regular')];
      expect(findActiveCoverage(regularOnly, MATH, '2026-10', 'exam-prep')).toEqual({
        kind: 'regular',
      });
    });

    it('returns null when neither track covers the subject regardless of preferKind', () => {
      const both2 = [sub('2026-09', null, [PHYS], 'regular'), sub('2026-09', null, [PHYS], 'exam-prep')];
      expect(findActiveCoverage(both2, MATH, '2026-10', 'regular')).toBeNull();
    });
  });
});
