import { useQuery } from '@tanstack/react-query';
import { DEFAULT_NIVEAU_CATALOG } from '../../lib/niveau-contract';
import { niveauxGateway } from '../../lib/niveaux/niveaux-gateway';
import { niveauKeys } from './keys';

/**
 * Loads every live level paired with its reference counts — the read model
 * backing the manage screen's grouped sections and the archive in-use guard.
 *
 * TEMP (SOU-260): seeds the Moroccan catalogue with zero usage so the screen
 * renders before the `niveau.*` channels exist; delete the `initialData` line
 * when the merge lands.
 */
export function useNiveauxWithUsage() {
  return useQuery({
    queryKey: niveauKeys.usage,
    queryFn: () => niveauxGateway.listWithUsage(),
    initialData: DEFAULT_NIVEAU_CATALOG.map((niveau) => ({
      niveau,
      studentCount: 0,
      groupCount: 0,
      teacherCount: 0,
    })),
    refetchOnWindowFocus: false,
  });
}
