/** Query keys for the planner module. The week read is a single cached query. */
export const plannerKeys = {
  all: ['planner'] as const,
  week: () => ['planner', 'week'] as const,
};
