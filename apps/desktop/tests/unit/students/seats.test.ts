import { describe, expect, it } from 'vitest';
import { computeSeats } from '../../../src/renderer/lib/students/seats';

describe('computeSeats', () => {
  it('reports unlimited plans', () => {
    expect(computeSeats('unlimited', 999)).toEqual({ kind: 'unlimited' });
  });

  it('computes remaining seats below the cap', () => {
    expect(computeSeats(50, 12)).toEqual({ kind: 'limited', max: 50, remaining: 38, full: false });
  });

  it('flags full at the cap and clamps below zero', () => {
    expect(computeSeats(50, 50)).toEqual({ kind: 'limited', max: 50, remaining: 0, full: true });
    expect(computeSeats(50, 55)).toEqual({ kind: 'limited', max: 50, remaining: 0, full: true });
  });
});
