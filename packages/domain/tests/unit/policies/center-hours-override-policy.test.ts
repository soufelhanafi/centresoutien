import { describe, it, expect } from 'vitest';
import {
  overrideCoversDate,
  activeOverrideOn,
  resolveEffectiveWindows,
  dayHoursToWindows,
} from '../../../src/policies/center-hours-override-policy';
import type { DayHours } from '../../../src/policies/session-conflict-policy';
import type {
  CenterHoursOverride,
  CenterHoursOverrideId,
  WeeklyTimeWindows,
} from '../../../src/entities/center-hours-override';
import type { TimeWindow } from '../../../src/value-objects/time-window';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import type { WeekdayIndex } from '../../../src/value-objects/weekday';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const w = (open: string, close: string): TimeWindow => ({
  open: open as TimeOfDay,
  close: close as TimeOfDay,
});
const day = (open: string | null, close: string | null): DayHours => ({
  dayOfWeek: 1 as WeekdayIndex,
  open: open as TimeOfDay | null,
  close: close as TimeOfDay | null,
});

/** A week where every weekday carries the same window list. */
function uniformWeek(windows: readonly TimeWindow[]): WeeklyTimeWindows {
  return { 0: windows, 1: windows, 2: windows, 3: windows, 4: windows, 5: windows, 6: windows };
}

function override(
  id: string,
  start: string,
  end: string,
  hoursByWeekday: WeeklyTimeWindows,
): CenterHoursOverride {
  return {
    id: id as CenterHoursOverrideId,
    centerCode: CENTER,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: new Date('2026-02-01T00:00:00Z'),
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    updatedBy: 'usr_00000000000000000000000001' as UserId,
    deletedAt: null,
    version: 0,
    dateRange: { start, end },
    hoursByWeekday,
  };
}

describe('overrideCoversDate', () => {
  const ramadan = override('cho_1', '2026-02-18', '2026-03-19', uniformWeek([w('09:00', '15:00')]));

  it('covers a date inside the inclusive range', () => {
    expect(overrideCoversDate(ramadan, '2026-03-01')).toBe(true);
  });

  it('covers both boundary dates (inclusive)', () => {
    expect(overrideCoversDate(ramadan, '2026-02-18')).toBe(true);
    expect(overrideCoversDate(ramadan, '2026-03-19')).toBe(true);
  });

  it('does not cover dates outside the range', () => {
    expect(overrideCoversDate(ramadan, '2026-02-17')).toBe(false);
    expect(overrideCoversDate(ramadan, '2026-03-20')).toBe(false);
  });
});

describe('activeOverrideOn', () => {
  it('returns null when no override covers the date', () => {
    const one = override('cho_1', '2026-02-18', '2026-03-19', uniformWeek([w('09:00', '15:00')]));
    expect(activeOverrideOn('2026-05-01', [one])).toBeNull();
  });

  it('returns the single covering override', () => {
    const one = override('cho_1', '2026-02-18', '2026-03-19', uniformWeek([w('09:00', '15:00')]));
    expect(activeOverrideOn('2026-03-01', [one])?.id).toBe('cho_1');
  });

  it('prefers the greatest id (most recently created) when two overlap the date', () => {
    const older = override('cho_1', '2026-02-18', '2026-03-19', uniformWeek([w('09:00', '15:00')]));
    const newer = override('cho_2', '2026-03-01', '2026-03-10', uniformWeek([w('10:00', '14:00')]));
    // Order of input must not matter — the id decides deterministically.
    expect(activeOverrideOn('2026-03-05', [older, newer])?.id).toBe('cho_2');
    expect(activeOverrideOn('2026-03-05', [newer, older])?.id).toBe('cho_2');
  });
});

describe('resolveEffectiveWindows', () => {
  const monday = 1 as WeekdayIndex;

  it('returns override windows when an override covers the date (precedence over static)', () => {
    const ov = override('cho_1', '2026-02-18', '2026-03-19', uniformWeek([w('09:00', '15:00'), w('21:00', '23:00')]));
    const windows = resolveEffectiveWindows('2026-03-01', monday, [ov], day('08:00', '20:00'));
    expect(windows).toEqual([w('09:00', '15:00'), w('21:00', '23:00')]);
  });

  it('treats an override weekday with no windows as closed', () => {
    const open = [w('09:00', '15:00')];
    const closedMonday: WeeklyTimeWindows = {
      0: open,
      1: [], // Monday closed under the override
      2: open,
      3: open,
      4: open,
      5: open,
      6: open,
    };
    const ov = override('cho_1', '2026-02-18', '2026-03-19', closedMonday);
    expect(resolveEffectiveWindows('2026-03-02', monday, [ov], day('08:00', '20:00'))).toEqual([]);
  });

  it('falls back to the static day when no override covers the date', () => {
    const ov = override('cho_1', '2026-02-18', '2026-03-19', uniformWeek([w('09:00', '15:00')]));
    expect(resolveEffectiveWindows('2026-05-04', monday, [ov], day('08:00', '18:00'))).toEqual([
      w('08:00', '18:00'),
    ]);
  });

  it('returns a closed static day as an empty list', () => {
    expect(resolveEffectiveWindows('2026-05-04', monday, [], day(null, null))).toEqual([]);
  });

  it('returns null (no constraint) when no override covers and no static day is supplied', () => {
    expect(resolveEffectiveWindows('2026-05-04', monday, [], null)).toBeNull();
  });
});

describe('dayHoursToWindows', () => {
  it('maps an open day to a single window', () => {
    expect(dayHoursToWindows(day('09:00', '18:00'))).toEqual([w('09:00', '18:00')]);
  });

  it('maps a closed day to an empty list', () => {
    expect(dayHoursToWindows(day(null, null))).toEqual([]);
  });
});
