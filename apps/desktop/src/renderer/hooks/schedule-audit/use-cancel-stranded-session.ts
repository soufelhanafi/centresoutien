import { useMutation, useQueryClient } from '@tanstack/react-query';
import { scheduleAuditGateway } from '../../lib/schedule-audit/schedule-audit-gateway';
import { scheduleAuditKeys } from './keys';

/**
 * Cancels (soft-deletes) ONE dated session occurrence from the audit report
 * (SOU-201) via the domain `session.cancel` channel — `id` is the occurrence id
 * (`ses_…`), so the weekly template and its sibling dates stay untouched. Soft
 * delete only: `deletedAt` is set, never a hard delete, so the tombstone still
 * syncs (CLAUDE.md §5). On success it invalidates the audit list; the cancelled
 * row is tombstone-excluded and does not reappear.
 */
export function useCancelStrandedSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => scheduleAuditGateway.cancel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: scheduleAuditKeys.all }),
  });
}
