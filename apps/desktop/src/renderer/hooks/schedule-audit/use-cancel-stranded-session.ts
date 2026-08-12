import { useMutation, useQueryClient } from '@tanstack/react-query';
import { scheduleAuditGateway } from '../../lib/schedule-audit/schedule-audit-gateway';
import { scheduleAuditKeys } from './keys';

/**
 * Cancels (soft-deletes) ONE dated session occurrence from the audit report
 * (SOU-201) via the domain `session.cancel` channel — `id` is the occurrence id
 * (`ses_…`), so the weekly template and its sibling dates stay untouched. Soft
 * delete only: `deletedAt` is set, never a hard delete, so the tombstone still
 * syncs (CLAUDE.md §5). It invalidates the audit list on settle — success or
 * failure alike — because the common failure is `SessionNotFoundError` from a row
 * another device already cancelled, and refetching drops that stale row. The
 * caller surfaces `isError` in the confirm dialog.
 */
export function useCancelStrandedSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => scheduleAuditGateway.cancel(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: scheduleAuditKeys.all }),
  });
}
