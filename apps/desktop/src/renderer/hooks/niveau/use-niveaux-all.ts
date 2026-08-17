import { useQuery } from '@tanstack/react-query';
import { niveauxGateway } from '../../lib/niveaux/niveaux-gateway';
import { niveauKeys } from './keys';

/**
 * Loads every live level (`niveau.list` with scope `all`) — active and
 * deactivated alike. Form pickers must resolve an already-assigned niveau even
 * after it was deactivated (so an edit can display and manage the retained
 * assignment), so the picker fields blend this set with the active-only set.
 */
export function useNiveauxAll() {
  return useQuery({
    queryKey: niveauKeys.list,
    queryFn: () => niveauxGateway.list('all'),
    refetchOnWindowFocus: false,
  });
}
