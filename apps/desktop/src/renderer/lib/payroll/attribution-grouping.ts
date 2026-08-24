/** The minimal flat shape both the collected and projected subject breakdowns share. */
type SubjectAmountRow = { readonly teacherId: string; readonly subjectId: string; readonly amountMad: number };

/**
 * Groups a flat month-wide subject-amount array by `teacherId`, for the
 * dashboard's per-teacher drill-down. The whole month is fetched once (see
 * `payroll-gateway.ts`); this is the client-side selector every expanded row
 * reads from instead of issuing its own call. Generic over the two breakdown
 * shapes (`TeacherAttributionBreakdownEntryView` and the projected variant) so
 * both the finalized drill-down and the SOU-316 projection reuse it.
 */
export function groupBreakdownByTeacher<T extends SubjectAmountRow>(
  breakdown: readonly T[],
): ReadonlyMap<string, readonly T[]> {
  const grouped = new Map<string, T[]>();
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
