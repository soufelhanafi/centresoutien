import { useQuery } from '@tanstack/react-query';
import { niveauxGateway } from '../../lib/niveaux/niveaux-gateway';
import { niveauKeys } from './keys';

/**
 * Loads every live level paired with its in-use reference counts — the read model
 * backing the manage screen's grouped sections and the archive in-use guard.
 */
export function useNiveauxWithUsage() {
  return useQuery({
    queryKey: niveauKeys.usage,
    queryFn: () => niveauxGateway.listWithUsage(),
    refetchOnWindowFocus: false,
  });
}
