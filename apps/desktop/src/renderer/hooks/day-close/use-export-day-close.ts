import { useMutation } from '@tanstack/react-query';
import { dayCloseGateway } from '../../lib/day-close/day-close-gateway';

/**
 * Saves the FR-only "Clôture du jour" PDF for a `'YYYY-MM-DD'` day to a user-picked
 * location (SOU-300); the result's `savedPath` is `null` when the dialog was
 * cancelled. Goes through the {@link dayCloseGateway} seam; the calling component
 * owns the toast/error copy so this stays presentation-free.
 */
export function useExportDayClose() {
  return useMutation({
    mutationFn: (day: string) => dayCloseGateway.export(day),
  });
}
