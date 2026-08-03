/** Query keys for the attendance module. */
export const attendanceKeys = {
  weeklySlots: (groupId: string) => ['attendance', 'weeklySlots', groupId] as const,
  studentReport: (studentId: string, month: string) =>
    ['attendance', 'studentReport', studentId, month] as const,
  groupSheet: (groupId: string, month: string) =>
    ['attendance', 'groupSheet', groupId, month] as const,
};
