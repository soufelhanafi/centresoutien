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
 *
 * Mirrors the real adapter's **prefer-kind** semantics: when several entries cover
 * the same `(studentId, subjectId)`, the one matching the requested `kind` wins,
 * otherwise the first covering entry — so "covered only by the wrong track" still
 * surfaces the wrong `kind` (not `null`), keeping EnrollStudent's two errors distinct.
 */
export function fakeStudentSubscriptionReference(
  coverages: readonly SubscriptionCoverageEntry[] = [],
): StudentSubscriptionReferencePort {
  return {
    activeCoverage: async (
      studentId: StudentId,
      subjectId: SubjectId,
      _month: string,
      kind?: GroupKind,
    ): Promise<ActiveSubscriptionCoverage | null> => {
      const covering = coverages.filter(
        (c) => c.studentId === studentId && c.subjectId === subjectId,
      );
      const match = covering.find((c) => c.kind === kind) ?? covering[0];
      return match ? { kind: match.kind } : null;
    },
  };
}
