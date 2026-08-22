import { useMutation } from '@tanstack/react-query';
import { multiCenterStatsGateway } from '../../lib/multi-center-stats/multi-center-stats-gateway';

/** Renders the per-center stats PDF in `locale` to a user-picked save location. */
export function useExportMultiCenterStats() {
  return useMutation({
    mutationFn: (locale: 'fr' | 'ar') => multiCenterStatsGateway.export(locale),
  });
}
