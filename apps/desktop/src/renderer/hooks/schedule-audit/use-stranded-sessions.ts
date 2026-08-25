import { useQuery } from '@tanstack/react-query';
import { scheduleAuditGateway } from '../../lib/schedule-audit/schedule-audit-gateway';
import { scheduleAuditKeys } from './keys';

/**
 * Loads the standing audit result (SOU-201, SOU-296, SOU-296bis): every live
 * occurrence the center's current effective state — hours, holidays, teacher
 * availability, or room/teacher conflicts — now strands (`groups`, collapsed by
 * root cause), plus every weekly template a teacher-availability edit now
 * strands before any concrete occurrence of it is materialized
 * (`recurringSlotWarnings`). Data access goes through the
 * {@link scheduleAuditGateway} seam, not `window.api` directly, so the mock
 * adapter swaps for the real IPC one in a single place.
 *
 * `refetchOnMount: 'always'` re-runs the audit every time the planner screen
 * mounts — the user expects a stale-teacher-availability conflict to surface
 * the moment they open planning, not up to 60s later.
 *
 * `enabled` (default `true`) lets a feature-gated caller keep the query dormant:
 * the audit use case requires `settings.center-hours`, so firing it for a plan
 * without that flag both wastes IPC and errors. Callers already scoped to a
 * screen where the feature is on simply omit it.
 */
export function useStrandedSessions(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: scheduleAuditKeys.outsideHours(),
    queryFn: () => scheduleAuditGateway.listOutsideHours(),
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
}
