import { describe, it, expect } from 'vitest';
import type { TimeOfDay } from '@centresoutien/domain';
import { assignLanes } from '../../../src/data/pdf/schedule-pdf-lane-layout';

type Session = { readonly label: string; readonly start: TimeOfDay; readonly end: TimeOfDay };

function session(label: string, start: string, end: string): Session {
  return { label, start: start as TimeOfDay, end: end as TimeOfDay };
}

describe('assignLanes', () => {
  it('puts every session in lane 0 with laneCount 1 when nothing overlaps', () => {
    const laned = assignLanes([session('a', '09:00', '10:00'), session('b', '10:00', '11:00')]);
    expect(laned.every((s) => s.lane === 0 && s.laneCount === 1)).toBe(true);
  });

  it('splits two time-overlapping sessions into distinct lanes', () => {
    const laned = assignLanes([session('a', '09:00', '10:30'), session('b', '09:30', '10:00')]);
    const lanes = new Set(laned.map((s) => s.lane));
    expect(lanes.size).toBe(2);
    expect(laned.every((s) => s.laneCount === 2)).toBe(true);
  });

  it('reuses a freed lane once its previous occupant has ended', () => {
    const laned = assignLanes([
      session('a', '09:00', '10:00'),
      session('b', '09:00', '09:30'),
      session('c', '09:30', '10:00'),
    ]);
    const byLabel = Object.fromEntries(laned.map((s) => [s.label, s]));
    expect(byLabel.a?.lane).toBe(0);
    expect(byLabel.b?.lane).toBe(1);
    expect(byLabel.c?.lane).toBe(1);
    expect(laned.every((s) => s.laneCount === 2)).toBe(true);
  });

  it('returns an empty array for an empty day', () => {
    expect(assignLanes([])).toEqual([]);
  });

  it('gives three mutually overlapping sessions three distinct lanes', () => {
    const laned = assignLanes([
      session('a', '09:00', '11:00'),
      session('b', '09:15', '10:45'),
      session('c', '09:30', '10:30'),
    ]);
    expect(new Set(laned.map((s) => s.lane)).size).toBe(3);
    expect(laned.every((s) => s.laneCount === 3)).toBe(true);
  });
});
