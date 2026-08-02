/** Query keys for the attendance module. */
export const attendanceKeys = {
  weeklySlots: (groupId: string) => ['attendance', 'weeklySlots', groupId] as const,
};
