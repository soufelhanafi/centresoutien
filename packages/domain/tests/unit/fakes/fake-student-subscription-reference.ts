import type {
  ActiveSubscriptionCoverage,
  StudentSubscriptionReferencePort,
} from '../../../src/ports/student-subscription-reference';
import type { StudentId } from '../../../src/entities/student';
import type { SubjectId } from '../../../src/entities/subject';
import type { GroupKind } from '../../../src/entities/group';

export type SubscriptionCoverageEntry = {
  studentId: StudentId;
  subjectId: SubjectId;
  kind: GroupKind;
};

/**
 * Configurable fake for the {@link StudentSubscriptionReferencePort}. Each entry
 * declares that a student holds an active subscription of `kind` covering
 * `subjectId`, so a test can arrange every branch of the `EnrollStudent` coverage
 * guard deterministically without the (not-yet-built, SOU-63) subscription
 * repository. `month` is ignored here — month-scoping is the real adapter's job.
 */
export function fakeStudentSubscriptionReference(
  coverages: readonly SubscriptionCoverageEntry[] = [],
): StudentSubscriptionReferencePort {
  return {
    activeCoverage: async (
      studentId: StudentId,
      subjectId: SubjectId,
    ): Promise<ActiveSubscriptionCoverage | null> => {
      const match = coverages.find(
        (c) => c.studentId === studentId && c.subjectId === subjectId,
      );
      return match ? { kind: match.kind } : null;
    },
  };
}
