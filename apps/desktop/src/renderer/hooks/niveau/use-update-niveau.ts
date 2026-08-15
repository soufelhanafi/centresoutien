import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NiveauUpdateInput } from '../../lib/niveaux/niveau-view';
import { niveauxGateway } from '../../lib/niveaux/niveaux-gateway';
import { niveauKeys } from './keys';

/**
 * Edits a level's bilingual name / code / category and/or its `active` flag
 * (rename, deactivate, and reactivate all go through this one channel). The id
 * is bound at call time; the mutation's input is the update fields without it.
 * Invalidates every niveaux query so the pickers and manage screen refetch.
 */
export function useUpdateNiveau(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<NiveauUpdateInput, 'id'>) =>
      niveauxGateway.update({ ...input, id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: niveauKeys.all }),
  });
}
