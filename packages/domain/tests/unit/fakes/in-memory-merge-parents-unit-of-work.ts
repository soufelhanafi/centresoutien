import type { MergeParentsUnitOfWork, MergeParentsUnit } from '../../../src/ports/merge-parents-unit-of-work';
import type { Parent } from '../../../src/entities/parent';
import type { Student } from '../../../src/entities/student';
import type { InMemoryParentRepository } from './in-memory-parent-repository';
import type { InMemoryStudentRepository } from './in-memory-student-repository';
import type { InMemoryMergeLogRepository } from './in-memory-merge-log-repository';

/**
 * In-memory {@link MergeParentsUnitOfWork} for unit tests. Writes into the same
 * in-memory parent/student/merge-log repositories the test seeded, mirroring the
 * SQLite adapter's one-transaction guarantee: the whole unit (winner, loser,
 * re-pointed students, merge log) is applied together, and a failure at any step
 * restores the prior snapshot so nothing is left half-merged. `failAfterWrites`
 * simulates a dependent re-point write failing after the parent rows already
 * went in — the SOU-169 rollback path.
 */
export class InMemoryMergeParentsUnitOfWork implements MergeParentsUnitOfWork {
  /** Number of `commit` calls — lets tests prove the use case calls it exactly once. */
  commits = 0;

  constructor(
    private readonly parents: InMemoryParentRepository,
    private readonly students: InMemoryStudentRepository,
    private readonly mergeLogs: InMemoryMergeLogRepository,
    private readonly failAfterWrites = false,
  ) {}

  async commit(unit: MergeParentsUnit): Promise<void> {
    this.commits += 1;
    const before = this.snapshot();
    try {
      await this.parents.save(unit.winner);
      await this.parents.save(unit.loser);
      if (this.failAfterWrites) throw new Error('simulated dependent re-point failure');
      for (const student of unit.repointedStudents) await this.students.save(student);
      await this.mergeLogs.record(unit.mergeLog);
    } catch (err) {
      this.restore(before);
      throw err;
    }
  }

  private snapshot(): { parents: readonly Parent[]; students: readonly Student[]; logs: readonly unknown[] } {
    return {
      parents: this.parents.all(),
      students: this.students.all(),
      logs: this.mergeLogs.all(),
    };
  }

  private async restore(snap: { parents: readonly Parent[]; students: readonly Student[]; logs: readonly unknown[] }): Promise<void> {
    this.parents.clear();
    for (const parent of snap.parents) await this.parents.save(parent);
    this.students.clear();
    for (const student of snap.students) await this.students.save(student);
    this.mergeLogs.clear();
    for (const log of snap.logs) await this.mergeLogs.record(log as Parameters<InMemoryMergeLogRepository['record']>[0]);
  }
}
