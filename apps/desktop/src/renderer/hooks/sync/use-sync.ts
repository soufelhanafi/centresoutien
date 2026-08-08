import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { syncGateway } from '../../lib/sync/sync-gateway';
import type { ConflictResolutionView } from '../../lib/sync/sync-view';
import { syncKeys } from './keys';

/**
 * The durable "conflits en attente" inbox — blocked conflicts survive restart.
 * `enabled` lets the caller skip the round trip while the page is plan-locked,
 * so a plan without `sync.multi-device` never fires an IPC the domain
 * `PlanPolicy` would reject.
 */
export function useBlockedConflicts(options: { enabled: boolean }) {
  return useQuery({
    queryKey: syncKeys.conflicts,
    queryFn: () => syncGateway.listConflicts(),
    enabled: options.enabled,
    refetchOnWindowFocus: true,
  });
}

/** Runs one pull → resolve → push cycle against the wired hub. */
export function useRunSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => syncGateway.run(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: syncKeys.conflicts }),
  });
}

/** Settles one conflict a human already decided on in the popup / inbox. */
export function useResolveConflict() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      entityType: string;
      entityId: string;
      resolution: ConflictResolutionView;
    }) => syncGateway.resolveConflict(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: syncKeys.conflicts }),
  });
}
