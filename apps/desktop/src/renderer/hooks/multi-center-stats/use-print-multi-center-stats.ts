import { useMutation } from '@tanstack/react-query';
import { multiCenterStatsGateway } from '../../lib/multi-center-stats/multi-center-stats-gateway';

/** Opens the per-center stats PDF, rendered in `locale`, in the OS viewer. */
export function usePrintMultiCenterStats() {
  return useMutation({
    mutationFn: (locale: 'fr' | 'ar') => multiCenterStatsGateway.print(locale),
  });
}
