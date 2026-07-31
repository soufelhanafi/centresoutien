import type { SubjectReferencePort } from '../../../src/ports/subject-reference';
import type { SubjectId } from '../../../src/entities/subject';

/**
 * Configurable fake for the {@link SubjectReferencePort}. `referenced` holds the
 * ids that report an active group / session / formula reference, so a test can
 * arrange either branch of the `ArchiveSubject` in-use guard deterministically
 * without the (not-yet-built) referencing repositories.
 */
export function fakeSubjectReference(referenced: readonly SubjectId[] = []): SubjectReferencePort {
  const inUse = new Set<string>(referenced);
  return {
    isSubjectInUse: async (subjectId: SubjectId) => inUse.has(subjectId),
  };
}
