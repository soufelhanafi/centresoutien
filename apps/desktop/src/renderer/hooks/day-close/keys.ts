/** Query keys for the end-of-day "Clôture du jour" module (SOU-300). */
export const dayCloseKeys = {
  all: ['day-close'] as const,
  report: (day: string) => ['day-close', 'report', day] as const,
};
