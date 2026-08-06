import type { MergeLogEntry } from '../entities/merge-log';
import type { Parent } from '../entities/parent';
import type { Student } from '../entities/student';

/**
 * The narrow, atomic commit seam for {@link import('../use-cases/merge-parents').MergeParents}.
 *
 * The use case computes EVERY row the merge changes — the winner (after
 * absorbing the loser's missing fields), the loser (tombstone + `mergedIntoId`),
 * every student whose `guardianIds` referenced the loser (re-pointed onto the
 * winner), and the audit {@link MergeLogEntry} — then hands the whole unit to
 * this ONE method. The SQLite adapter (SOU-90) persists all of it inside a
 * single transaction, so a failure at any step rolls the merge back completely:
 * no winner without its tombstoned loser, no student half re-pointed, and no
 * merge that committed without its log entry (SOU-169).
 *
 * The unit-of-work is deliberately narrow — it receives final entities and
 * translates them to writes, carrying no business decisions itself. Reads
 * (finding the students who referenced the loser) happen through the ordinary
 * `StudentRepository.listByGuardian` before `commit` is called.
 */
export type MergeParentsUnit = {
  readonly winner: Parent;
  readonly loser: Parent;
  readonly repointedStudents: readonly Student[];
  readonly mergeLog: MergeLogEntry;
};

export interface MergeParentsUnitOfWork {
  /** Persist the whole merge atomically. Must not partially apply on failure. */
  commit(unit: MergeParentsUnit): Promise<void>;
}
