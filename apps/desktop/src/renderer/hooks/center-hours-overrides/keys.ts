/** Query keys for dated center-hours overrides. Mutations invalidate `.all`. */
export const centerHoursOverrideKeys = {
  all: ['center-hours-overrides'] as const,
  list: () => ['center-hours-overrides', 'list'] as const,
  listRange: (start: string, end: string) =>
    ['center-hours-overrides', 'list', 'range', start, end] as const,
  active: (date: string) => ['center-hours-overrides', 'active', date] as const,
};
