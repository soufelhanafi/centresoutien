import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NiveauInput } from '../../lib/niveaux/niveau-view';
import { niveauxGateway } from '../../lib/niveaux/niveaux-gateway';
import { niveauKeys } from './keys';

/**
 * Creates a level. On success it invalidates every niveaux query so the form
 * pickers, the list filters, and the manage screen refetch together. Data access
 * goes through the {@link niveauxGateway} seam, not `window.api` directly.
 */
export function useCreateNiveau() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NiveauInput) => niveauxGateway.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: niveauKeys.all }),
  });
}
