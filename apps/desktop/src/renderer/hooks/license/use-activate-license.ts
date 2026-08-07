import { useMutation, useQueryClient } from '@tanstack/react-query';
import { licenseApi } from '../../lib/license/license-api';
import { usePlanStore } from '../../stores/plan-store';
import { licenseStatusQueryKey } from './use-license-status';

/**
 * Activates a pasted key or imported license file (SOU-104). On an `activated`
 * result the plan flips live — mirroring the domain's PlanPolicy update — by
 * updating the UI plan store and invalidating the license-status query so every
 * gated screen re-evaluates without a restart. A `rejected` result leaves the
 * plan untouched; callers read `data.reason` to show the specific message.
 */
export function useActivateLicense() {
  const queryClient = useQueryClient();
  const setPlan = usePlanStore((state) => state.setPlan);

  return useMutation({
    mutationFn: (license: string) => licenseApi.activate(license),
    onSuccess: (result) => {
      if (result.status === 'activated') {
        setPlan(result.plan);
        void queryClient.invalidateQueries({ queryKey: licenseStatusQueryKey });
      }
    },
  });
}
