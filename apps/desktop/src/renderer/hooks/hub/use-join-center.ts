import { useMutation, useQueryClient } from '@tanstack/react-query';
import { hubGateway } from '../../lib/hub/hub-gateway-instance';
import type { JoinCenterRequest } from '../../lib/hub/hub-gateway';
import { adminExistsQueryKey } from '../wizard/use-admin-exists';
import { licenseStatusQueryKey } from '../license/use-license-status';

/**
 * Joins a discovered center from the first-run branch (SOU-318). On success main
 * has cold-bootstrapped the local replica and switched into the joined center — so
 * the first-run gate must re-evaluate: the synced admin now exists, which sends
 * the app to the login screen. Invalidating the (session-stable) `admin.exists`
 * and license reads is what re-renders the gate; we never navigate manually.
 */
export function useJoinCenter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: JoinCenterRequest) => hubGateway.joinCenter(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminExistsQueryKey });
      void queryClient.invalidateQueries({ queryKey: licenseStatusQueryKey });
    },
  });
}
