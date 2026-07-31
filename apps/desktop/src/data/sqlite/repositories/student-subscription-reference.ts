import type {
  StudentSubscriptionReferencePort,
  ActiveSubscriptionCoverage,
  StudentSubscriptionRepository,
  StudentId,
  SubjectId,
  GroupKind,
} from '@centresoutien/domain';
import { findActiveCoverage } from '@centresoutien/domain';

/**
 * The real {@link StudentSubscriptionReferencePort} adapter (SOU-63) — the one
 * `EnrollStudent` (SOU-121) consumes for its coverage + cross-kind guards, replacing
 * the declared-only contract's in-memory fake.
 *
 * It loads the student's live (non-tombstoned) subscriptions through the repository
 * port and answers coverage with the pure domain `findActiveCoverage` policy — the
 * frozen `subjectIds` + `kind` snapshot on each subscription is the source of truth,
 * so there is no Formula dereference (no Formula entity exists yet). Center scoping
 * is implicit: one encrypted DB per center, so every subscription the repo returns
 * belongs to this center.
 */
export class SqliteStudentSubscriptionReference implements StudentSubscriptionReferencePort {
  constructor(private readonly subscriptions: StudentSubscriptionRepository) {}

  async activeCoverage(
    studentId: StudentId,
    subjectId: SubjectId,
    month: string,
    kind?: GroupKind,
  ): Promise<ActiveSubscriptionCoverage | null> {
    const live = await this.subscriptions.listLiveByStudent(studentId);
    return findActiveCoverage(live, subjectId, month, kind);
  }
}
