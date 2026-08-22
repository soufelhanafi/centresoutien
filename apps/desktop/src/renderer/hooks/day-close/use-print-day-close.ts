import { useMutation } from '@tanstack/react-query';
import { dayCloseGateway } from '../../lib/day-close/day-close-gateway';

/**
 * Opens the FR-only "Clôture du jour" PDF for a `'YYYY-MM-DD'` day in the OS's
 * default viewer (SOU-300). Goes through the {@link dayCloseGateway} seam; the
 * calling component owns the toast/error copy so this stays presentation-free.
 */
export function usePrintDayClose() {
  return useMutation({
    mutationFn: (day: string) => dayCloseGateway.print(day),
  });
}
