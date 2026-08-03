import { describe, it, expect } from 'vitest';
import type { TimeOfDay, WeekdayIndex } from '@centresoutien/domain';
import {
  computeGridGeometry,
  computeScheduleTimeBounds,
  dayColumnIndex,
  dayColumnX,
  GRID_MARGIN,
  minutesToGridY,
  timeToGridY,
} from '../../../src/data/pdf/schedule-pdf-geometry';
import type { ScheduleExportSessionRow } from '../../../src/data/pdf/schedule-pdf-input';

function row(over: Partial<ScheduleExportSessionRow> = {}): ScheduleExportSessionRow {
  return {
    dayOfWeek: 1 as WeekdayIndex,
    start: '09:00' as TimeOfDay,
    end: '10:00' as TimeOfDay,
    roomName: 'Salle 1',
    teacherName: null,
    subjectId: null,
    subjectName: null,
    level: null,
    kind: 'regular',
    ...over,
  };
}

describe('computeScheduleTimeBounds', () => {
  it('defaults to 08:00–20:00 for an empty week', () => {
    expect(computeScheduleTimeBounds([])).toEqual({ startMinutes: 8 * 60, endMinutes: 20 * 60 });
  });

  it('keeps the default bounds when every session already fits inside them', () => {
    const bounds = computeScheduleTimeBounds([row({ start: '09:00' as TimeOfDay, end: '10:00' as TimeOfDay })]);
    expect(bounds).toEqual({ startMinutes: 8 * 60, endMinutes: 20 * 60 });
  });

  it('widens with a half-hour margin around a session outside the default window', () => {
    const bounds = computeScheduleTimeBounds([row({ start: '07:00' as TimeOfDay, end: '21:30' as TimeOfDay })]);
    expect(bounds).toEqual({ startMinutes: 7 * 60 - 30, endMinutes: 21 * 60 + 30 + 30 });
  });
});

describe('computeGridGeometry', () => {
  it('reserves the time axis on the physical left for fr and divides the rest into 7 equal columns', () => {
    const geometry = computeGridGeometry(841.89, 595.28, [], 'fr');
    expect(geometry.gridLeft).toBeGreaterThan(GRID_MARGIN);
    expect(geometry.gridRight).toBeCloseTo(841.89 - GRID_MARGIN, 5);
    expect(geometry.columnWidth * 7).toBeCloseTo(geometry.gridRight - geometry.gridLeft, 5);
    expect(geometry.gridTop).toBeGreaterThan(geometry.gridBottom);
  });

  it('reserves the time axis on the physical right for ar — matching the RTL on-screen hour gutter', () => {
    const geometry = computeGridGeometry(841.89, 595.28, [], 'ar');
    expect(geometry.gridLeft).toBeCloseTo(GRID_MARGIN, 5);
    expect(geometry.gridRight).toBeLessThan(841.89 - GRID_MARGIN);
    expect(geometry.columnWidth * 7).toBeCloseTo(geometry.gridRight - geometry.gridLeft, 5);
  });
});

describe('dayColumnIndex / dayColumnX', () => {
  const geometry = computeGridGeometry(841.89, 595.28, [], 'ar');

  it('keeps Sunday-first order for fr', () => {
    expect(dayColumnIndex(0 as WeekdayIndex, 'fr')).toBe(0);
    expect(dayColumnIndex(6 as WeekdayIndex, 'fr')).toBe(6);
  });

  it('mirrors the day order for ar — Sunday lands on the rightmost column', () => {
    expect(dayColumnIndex(0 as WeekdayIndex, 'ar')).toBe(6);
    expect(dayColumnIndex(6 as WeekdayIndex, 'ar')).toBe(0);
  });

  it('places the mirrored ar Sunday column physically to the right of Monday', () => {
    const sunday = dayColumnX(0 as WeekdayIndex, geometry, 'ar');
    const monday = dayColumnX(1 as WeekdayIndex, geometry, 'ar');
    expect(sunday).toBeGreaterThan(monday);
  });
});

describe('minutesToGridY / timeToGridY', () => {
  const geometry = computeGridGeometry(841.89, 595.28, [], 'fr');

  it('places the bounds start at gridTop and the bounds end at gridBottom', () => {
    expect(minutesToGridY(geometry.timeBounds.startMinutes, geometry)).toBeCloseTo(geometry.gridTop, 5);
    expect(minutesToGridY(geometry.timeBounds.endMinutes, geometry)).toBeCloseTo(geometry.gridBottom, 5);
  });

  it('places a later time strictly lower on the page (smaller y) than an earlier one', () => {
    const early = timeToGridY('09:00' as TimeOfDay, geometry);
    const late = timeToGridY('15:00' as TimeOfDay, geometry);
    expect(late).toBeLessThan(early);
  });
});
