import type { TeacherAttributionBreakdownEntryView } from './teacher-payout-view';

/**
 * Groups the flat month-wide `payroll.attributionBreakdown` rows by
 * `teacherId`, for the dashboard's per-teacher drill-down. The whole month is
 * fetched once (see `payroll-gateway.ts`); this is the client-side selector
 * every expanded row reads from instead of issuing its own call.
 */
export function groupBreakdownByTeacher(
  breakdown: readonly TeacherAttributionBreakdownEntryView[],
): ReadonlyMap<string, readonly TeacherAttributionBreakdownEntryView[]> {
  const grouped = new Map<string, TeacherAttributionBreakdownEntryView[]>();
  for (const entry of breakdown) {
    const forTeacher = grouped.get(entry.teacherId);
    if (forTeacher) {
      forTeacher.push(entry);
    } else {
      grouped.set(entry.teacherId, [entry]);
    }
  }
  return grouped;
}
