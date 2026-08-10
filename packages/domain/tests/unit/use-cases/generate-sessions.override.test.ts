import { describe, it, expect } from 'vitest';
import {
  GenerateSessions,
  type GenerateSessionsInput,
} from '../../../src/use-cases/generate-sessions';
import type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
} from '../../../src/entities/weekly-recurring-session';
import type {
  CenterHoursOverride,
  CenterHoursOverrideId,
  WeeklyTimeWindows,
} from '../../../src/entities/center-hours-override';
import type { HolidayOccurrence } from '../../../src/policies/holiday-policy';
import type { HolidayId } from '../../../src/entities/holiday';
import type { TimeWindow } from '../../../src/value-objects/time-window';
import type { RoomId } from '../../../src/entities/room';
import type { CenterCode, DeviceId, EntityId, UserId } from '../../../src/value-objects/ids';
import type { TimeOfDay } from '../../../src/value-objects/time-of-day';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CENTER = 'CS-CASA-001' as CenterCode;
const DEVICE = 'dev_00000000000000000000000001' as DeviceId;
const USER = 'usr_00000000000000000000000001' as UserId;
const w = (open: string, close: string): TimeWindow => ({
  open: open as TimeOfDay,
  close: close as TimeOfDay,
});

// A Thursday (weekday 4) 09:00–10:30 recurrence; January 2026 Thursdays: 01, 08, 15, 22, 29.
function recurring(over: Partial<WeeklyRecurringSession> = {}): WeeklyRecurringSession {
  return {
    id: 'wrs_00000000000000000000000001' as WeeklyRecurringSessionId,
    centerCode: CENTER,
    deviceOrigin: 'dev_00000000000000000000000009' as DeviceId,
    createdAt: new Date('2025-12-01T00:00:00Z'),
    updatedAt: new Date('2025-12-01T00:00:00Z'),
    updatedBy: 'usr_00000000000000000000000009' as UserId,
    deletedAt: null,
    version: 1,
    roomId: 'rom_00000000000000000000000001' as RoomId,
    teacherId: 'tch_00000000000000000000000001' as EntityId,
    groupId: null,
    dayOfWeek: 4,
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    active: true,
    validFrom: null,
    validTo: null,
    ...over,
  };
}

/** An override where only the Thursday (weekday 4) window list is meaningful. */
function override(
  id: string,
  start: string,
  end: string,
  thursdayWindows: readonly TimeWindow[],
): CenterHoursOverride {
  const closed: readonly TimeWindow[] = [];
  const hoursByWeekday: WeeklyTimeWindows = {
    0: closed,
    1: closed,
    2: closed,
    3: closed,
    4: thursdayWindows,
    5: closed,
    6: closed,
  };
  return {
    id: id as CenterHoursOverrideId,
    centerCode: CENTER,
    deviceOrigin: DEVICE,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    dateRange: { start, end },
    hoursByWeekday,
  };
}

function holiday(over: Partial<HolidayOccurrence> = {}): HolidayOccurrence {
  return {
    id: 'hol_00000000000000000000000001' as HolidayId,
    name: { fr: 'Jour férié', ar: 'عيد' },
    kind: 'fixed',
    startDate: '2026-01-15',
    endDate: '2026-01-15',
    ...over,
  };
}

function input(over: Partial<GenerateSessionsInput> = {}): GenerateSessionsInput {
  return {
    recurring: recurring(),
    holidays: [],
    range: { start: '2026-01-01', end: '2026-01-31' },
    deviceOrigin: DEVICE,
    updatedBy: USER,
    ...over,
  };
}

function run(over: Partial<GenerateSessionsInput> = {}) {
  return new GenerateSessions(fakeClock('2026-01-01T08:00:00Z'), fakeIds()).execute(input(over));
}

describe('GenerateSessions — center-hours overrides (SOU-165)', () => {
  it('materializes every Thursday and skips nothing when no override is supplied', () => {
    const result = run();
    expect(result.sessions.map((s) => s.date)).toEqual([
      '2026-01-01',
      '2026-01-08',
      '2026-01-15',
      '2026-01-22',
      '2026-01-29',
    ]);
    expect(result.skippedOutsideHours).toEqual([]);
  });

  it('materializes normally when the override window contains the slot', () => {
    const ov = override('cho_1', '2026-01-01', '2026-01-31', [w('08:00', '12:00')]);
    const result = run({ overrides: [ov] });
    expect(result.sessions).toHaveLength(5);
    expect(result.skippedOutsideHours).toEqual([]);
  });

  it('skips every covered date whose slot falls outside the override windows, reporting each', () => {
    // Ramadan Thursday only opens 12:00–15:00 — the 09:00–10:30 slot no longer fits.
    const ov = override('cho_1', '2026-01-01', '2026-01-31', [w('12:00', '15:00')]);
    const result = run({ overrides: [ov] });
    expect(result.sessions).toEqual([]);
    expect(result.skippedOutsideHours.map((s) => s.date)).toEqual([
      '2026-01-01',
      '2026-01-08',
      '2026-01-15',
      '2026-01-22',
      '2026-01-29',
    ]);
    expect(result.skippedOutsideHours[0]?.windows).toEqual([w('12:00', '15:00')]);
  });

  it('only skips dates the override actually covers; others materialize', () => {
    // Override starts mid-month — Thursdays 01 and 08 are outside it and unaffected.
    const ov = override('cho_1', '2026-01-15', '2026-01-31', [w('12:00', '15:00')]);
    const result = run({ overrides: [ov] });
    expect(result.sessions.map((s) => s.date)).toEqual(['2026-01-01', '2026-01-08']);
    expect(result.skippedOutsideHours.map((s) => s.date)).toEqual([
      '2026-01-15',
      '2026-01-22',
      '2026-01-29',
    ]);
  });

  it('accepts a slot that fits one of several windows (iftar break)', () => {
    // Two windows; the 09:00–10:30 slot fits the first, so every Thursday materializes.
    const ov = override('cho_1', '2026-01-01', '2026-01-31', [w('09:00', '12:00'), w('21:00', '23:00')]);
    const result = run({ overrides: [ov] });
    expect(result.sessions).toHaveLength(5);
    expect(result.skippedOutsideHours).toEqual([]);
  });

  it('skips a slot that spans the gap between two windows', () => {
    // Slot 09:00–10:30 spans the gap between 09:00–10:00 and 11:00–13:00.
    const ov = override('cho_1', '2026-01-01', '2026-01-31', [w('09:00', '10:00'), w('11:00', '13:00')]);
    const result = run({ overrides: [ov] });
    expect(result.sessions).toEqual([]);
    expect(result.skippedOutsideHours).toHaveLength(5);
  });

  it('treats a closed override weekday as skip-all', () => {
    const ov = override('cho_1', '2026-01-01', '2026-01-31', []); // Thursday closed
    const result = run({ overrides: [ov] });
    expect(result.sessions).toEqual([]);
    expect(result.skippedOutsideHours).toHaveLength(5);
    expect(result.skippedOutsideHours[0]?.windows).toEqual([]);
  });

  it('still skips holidays before applying the override check (a holiday is not an outside-hours skip)', () => {
    const ov = override('cho_1', '2026-01-01', '2026-01-31', [w('12:00', '15:00')]);
    const result = run({ overrides: [ov], holidays: [holiday({ startDate: '2026-01-15', endDate: '2026-01-15' })] });
    expect(result.skippedHolidays.map((s) => s.date)).toEqual(['2026-01-15']);
    // 2026-01-15 is a holiday, so it is NOT double-counted as an outside-hours skip.
    expect(result.skippedOutsideHours.map((s) => s.date)).toEqual([
      '2026-01-01',
      '2026-01-08',
      '2026-01-22',
      '2026-01-29',
    ]);
  });
});
