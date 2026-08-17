import { useQuery } from '@tanstack/react-query';
import { niveauxGateway } from '../../lib/niveaux/niveaux-gateway';
import { niveauKeys } from './keys';

/**
 * Loads the assignable level set (`niveau.list` with scope `active`) — the option
 * source for the student/group/teacher form selects and the list filters.
 */
export function useNiveauxActive() {
  return useQuery({
    queryKey: niveauKeys.active,
    queryFn: () => niveauxGateway.list('active'),
    refetchOnWindowFocus: false,
  });
}
