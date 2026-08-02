import { useEffect, useState } from 'react';
import type { RosterEntry } from '../../lib/groups/group-view';
import type { AttendanceStatus, RollCallRecordInput } from '../../lib/attendance/attendance-view';

const DEFAULT_STATUS: AttendanceStatus = 'present';

/** Local roll-call state. Every row *displays* present by default (zero clicks
 *  for the common "bulk-mark-present then flip absentees" case), but only rows
 *  the admin actually touched — individually or via "mark all present" — are
 *  submitted. Reopening the sheet to correct one student therefore only ever
 *  resubmits that student, never silently resets the rest of the roster back
 *  to present (reviewer finding, SOU-58 Stage 3). Resets whenever the `roster`
 *  reference changes — the query hands back a stable reference until the sheet
 *  reopens or refetches. */
export function useRollCallStatus(roster: readonly RosterEntry[]) {
  const [touched, setTouched] = useState<ReadonlyMap<string, AttendanceStatus>>(new Map());

  useEffect(() => {
    setTouched(new Map());
  }, [roster]);

  const statusOf = (studentId: string): AttendanceStatus => touched.get(studentId) ?? DEFAULT_STATUS;

  const setStatus = (studentId: string, status: AttendanceStatus) => {
    setTouched((current) => new Map(current).set(studentId, status));
  };

  const markAllPresent = () => {
    setTouched(new Map(roster.map((entry) => [entry.studentId, DEFAULT_STATUS])));
  };

  const presentCount = roster.filter((entry) => statusOf(entry.studentId) === 'present').length;

  const toRecords = (): readonly RollCallRecordInput[] =>
    roster
      .filter((entry) => touched.has(entry.studentId))
      .map((entry) => ({ studentId: entry.studentId, status: statusOf(entry.studentId) }));

  return { statusOf, setStatus, markAllPresent, presentCount, touchedCount: touched.size, toRecords };
}
