import type { NiveauReferencePort } from '../../../src/ports/niveau-reference';
import type { NiveauId } from '../../../src/entities/niveau';

/**
 * Configurable fake for the {@link NiveauReferencePort}. `referenced` holds the
 * ids that report a live student / group / teacher reference, so a test can
 * arrange either branch of the `ArchiveNiveau` in-use guard deterministically
 * without the referencing repositories. Mirrors `fakeSubjectReference`.
 */
export function fakeNiveauReference(referenced: readonly NiveauId[] = []): NiveauReferencePort {
  const inUse = new Set<string>(referenced);
  return {
    isNiveauInUse: async (niveauId: NiveauId) => inUse.has(niveauId),
  };
}
