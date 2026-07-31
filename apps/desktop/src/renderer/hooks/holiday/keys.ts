import type { HolidayStatus } from '../../lib/holidays/holiday-view';

/** Query keys for the holidays module. Mutations invalidate `holidayKeys.all`. */
export const holidayKeys = {
  all: ['holidays'] as const,
  list: (status: HolidayStatus) => ['holidays', 'list', status] as const,
};
