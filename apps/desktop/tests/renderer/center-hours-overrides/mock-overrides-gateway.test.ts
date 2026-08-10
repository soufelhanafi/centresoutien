import { describe, it, expect } from 'vitest';
import { WEEKDAYS, type WeekdayIndex } from '@centresoutien/domain';
import { MockCenterHoursOverridesGateway } from '../../../src/renderer/lib/center-hours-overrides/mock-overrides-gateway';
import type {
  CenterHoursOverrideInput,
  HoursByWeekday,
  TimeWindow,
} from '../../../src/renderer/lib/center-hours-overrides/override-view';

function inputWith(
  dateRange: { start: string; end: string },
  windowsByDay: Partial<Record<WeekdayIndex, readonly TimeWindow[]>>,
): CenterHoursOverrideInput {
  const hoursByWeekday = {} as Record<WeekdayIndex, readonly TimeWindow[]>;
  for (const day of WEEKDAYS) hoursByWeekday[day] = windowsByDay[day] ?? [];
  return { dateRange, hoursByWeekday: hoursByWeekday as HoursByWeekday };
}

describe('MockCenterHoursOverridesGateway', () => {
  it('save → list surfaces the created override, most recent first', async () => {
    const gateway = new MockCenterHoursOverridesGateway();
    await gateway.save(inputWith({ start: '2026-01-01', end: '2026-01-31' }, {}));
    await gateway.save(inputWith({ start: '2026-03-01', end: '2026-03-31' }, {}));
    const list = await gateway.list();
    expect(list.map((override) => override.dateRange.start)).toEqual(['2026-03-01', '2026-01-01']);
  });

  it('getActive returns the override covering a date, null otherwise', async () => {
    const gateway = new MockCenterHoursOverridesGateway();
    await gateway.save(inputWith({ start: '2026-03-01', end: '2026-03-30' }, {}));
    expect(await gateway.getActive('2026-03-15')).not.toBeNull();
    expect(await gateway.getActive('2026-04-01')).toBeNull();
  });

  it('archive removes the override from list and active lookups', async () => {
    const gateway = new MockCenterHoursOverridesGateway();
    const saved = await gateway.save(inputWith({ start: '2026-03-01', end: '2026-03-30' }, {}));
    await gateway.archive(saved.id);
    expect(await gateway.list()).toHaveLength(0);
    expect(await gateway.getActive('2026-03-15')).toBeNull();
  });
});
