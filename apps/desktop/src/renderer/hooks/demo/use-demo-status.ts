import { useQuery } from '@tanstack/react-query';
import { demoGateway } from '../../lib/demo/demo-gateway';

export const demoStatusQueryKey = ['demo', 'status'] as const;

/**
 * Whether the open center is the demo center (SOU-110). Read once per launch
 * and treated as stable — like the plan/session hydration reads — so the app
 * chrome banner and the Settings tab stay consistent on the same cached value.
 */
export function useDemoStatus() {
  return useQuery({
    queryKey: demoStatusQueryKey,
    queryFn: () => demoGateway.status(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
