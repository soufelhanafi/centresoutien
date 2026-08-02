import { useMutation } from '@tanstack/react-query';
import { attendanceGateway } from '../../lib/attendance/attendance-gateway';
import type { RollCallRecordInput } from '../../lib/attendance/attendance-view';

type SubmitRollCallInput = {
  recurringSessionId: string;
  date: string;
  records: readonly RollCallRecordInput[];
};

/** Resolves the concrete session for `(recurringSessionId, date)` then submits
 *  the whole roster in one batched `attendance.record` write. No query to
 *  invalidate — the roll-call sheet closes on success and holds no other cache. */
export function useSubmitRollCall() {
  return useMutation({
    mutationFn: async ({ recurringSessionId, date, records }: SubmitRollCallInput) => {
      const { sessionId } = await attendanceGateway.resolveSession(recurringSessionId, date);
      return attendanceGateway.submit(sessionId, records);
    },
  });
}
