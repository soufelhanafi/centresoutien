import { describe, it, expect } from 'vitest';
import {
  isPayrollRuleActiveInMonth,
  payrollRuleRangesOverlap,
} from '../../../src/policies/teacher-payroll-rule-policy';

describe('isPayrollRuleActiveInMonth', () => {
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
    expect(isPayrollRuleActiveInMonth({ startMonth: start, endMonth: end }, month)).toBe(expected);
  });
});

describe('payrollRuleRangesOverlap', () => {
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
    expect(payrollRuleRangesOverlap(aS, aE, bS, bE)).toBe(expected);
  });
});
