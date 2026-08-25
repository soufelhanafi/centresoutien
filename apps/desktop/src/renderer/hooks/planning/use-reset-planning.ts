import { useMutation, useQueryClient } from '@tanstack/react-query';
import { planningResetGateway } from '../../lib/planning/planning-reset-gateway';
import { plannerKeys } from './keys';
import { scheduleAuditKeys } from '../schedule-audit/keys';

/**
 * Wipes all future sessions from a computed cutoff date (SOU-295). On success it
 * invalidates the planner week query so the emptied grid appears without a reload
 * (same pattern as `useCreateSession`), and the schedule-audit query so the
 * conflicts dialog drops sessions the reset just soft-deleted instead of serving
 * a stale cached list (mirrors `useSaveCenterHours`).
 */
export function useResetPlanning() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cutoffDate: string) => planningResetGateway.reset(cutoffDate),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: plannerKeys.all });
      void queryClient.invalidateQueries({ queryKey: scheduleAuditKeys.all });
    },
  });
}
