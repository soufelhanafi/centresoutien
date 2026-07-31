import type { TeacherReferencePort } from '../../../src/ports/teacher-reference';
import type { TeacherId } from '../../../src/entities/teacher';

/**
 * Configurable fake for the {@link TeacherReferencePort}. `referenced` holds the
 * ids that report an active group/session/payroll reference, so a test can arrange
 * either branch of the `ArchiveTeacher` in-use guard deterministically without the
 * (not-yet-built) Group / payroll repositories. Mirrors `fakeRoomReference`.
 */
export function fakeTeacherReference(referenced: readonly TeacherId[] = []): TeacherReferencePort {
  const inUse = new Set<string>(referenced);
  return {
    hasReferencesForTeacher: async (teacherId: TeacherId) => inUse.has(teacherId),
  };
}
