import { useMutation, useQueryClient } from '@tanstack/react-query';
import { niveauxGateway } from '../../lib/niveaux/niveaux-gateway';
import { niveauKeys } from './keys';

/**
 * Archives (soft-deletes, no undo) a niveau. Rejected with a `NiveauInUseError`
 * if it is still referenced by a live student/group/teacher — the caller maps
 * that via {@link mapNiveauWriteError} to show the delete-blocked view. On
 * success it invalidates every niveaux query.
 */
export function useArchiveNiveau() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => niveauxGateway.archive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: niveauKeys.all }),
  });
}
