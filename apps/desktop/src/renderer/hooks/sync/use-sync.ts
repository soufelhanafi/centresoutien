import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
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
    onSuccess: (result) => {
      if (result) invalidateAllDomainQueries(queryClient);
    },
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
    onSuccess: () => invalidateAllDomainQueries(queryClient),
  });
}

/**
 * A completed sync (or a resolved conflict) can project any entity type —
 * students, invoices, payments, planner, dashboard metrics — into the local DB,
 * and the run result does not enumerate which. Invalidating every query rather
 * than a hand-maintained subset guarantees no mounted screen keeps stale
 * post-sync data, and stays correct as new query families are added (SOU-234).
 * React Query only refetches the queries that are currently mounted, so the
 * cost is bounded by what the user is actually looking at.
 */
function invalidateAllDomainQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries();
}
