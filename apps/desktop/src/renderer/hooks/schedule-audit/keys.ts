/** Query keys for the schedule-audit module (SOU-201). One cached list read. */
export const scheduleAuditKeys = {
  all: ['schedule-audit'] as const,
  outsideHours: () => ['schedule-audit', 'outside-hours'] as const,
};
