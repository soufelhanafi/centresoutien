import { describe, it, expect } from 'vitest';
import { layoutDaySessions } from '../../../src/renderer/lib/planning/day-layout';
import { session } from './_fixtures';

describe('layoutDaySessions', () => {
  it('keeps non-overlapping sessions full width in a single lane', () => {
    const out = layoutDaySessions([
      session({ start: '09:00', end: '10:00' }),
      session({ start: '11:00', end: '12:00' }),
    ]);
    expect(out.map((o) => [o.lane, o.lanes])).toEqual([
      [0, 1],
      [0, 1],
    ]);
  });

  it('treats back-to-back sessions (shared boundary) as non-overlapping', () => {
    // 10:00 start meets 10:00 end — half-open, so they never share a lane cluster.
    const out = layoutDaySessions([
      session({ start: '09:00', end: '10:00' }),
      session({ start: '10:00', end: '11:00' }),
    ]);
    expect(out.every((o) => o.lanes === 1)).toBe(true);
  });

  it('splits two overlapping sessions into two lanes', () => {
    const out = layoutDaySessions([
      session({ start: '09:00', end: '10:00' }),
      session({ start: '09:30', end: '10:30' }),
    ]);
    expect(out.map((o) => o.lane)).toEqual([0, 1]);
    expect(out.every((o) => o.lanes === 2)).toBe(true);
  });

  it('shares a lane across a bridged cluster and reuses a freed lane', () => {
    // A (09:00–11:00) overlaps both B (09:30–10:00) and C (10:30–11:00);
    // B and C do not overlap each other, so C reuses B's lane. Cluster width = 2.
    const out = layoutDaySessions([
      session({ id: 'A', start: '09:00', end: '11:00' }),
      session({ id: 'B', start: '09:30', end: '10:00' }),
      session({ id: 'C', start: '10:30', end: '11:00' }),
    ]);
    const byId = Object.fromEntries(out.map((o) => [o.session.id, o]));
    expect(byId.A?.lane).toBe(0);
    expect(byId.B?.lane).toBe(1);
    expect(byId.C?.lane).toBe(1); // reuses B's lane, freed at 10:00
    expect(out.every((o) => o.lanes === 2)).toBe(true);
  });

  it('returns an empty layout for an empty day', () => {
    expect(layoutDaySessions([])).toEqual([]);
  });
});
