import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { StudentSubscriptionRepository } from '../../../src/ports/student-subscription-repository';
import type {
  StudentSubscription,
  StudentSubscriptionId,
} from '../../../src/entities/student-subscription';
import type { StudentId } from '../../../src/entities/student';
import type { GroupKind } from '../../../src/entities/group';
import type { CenterCode } from '../../../src/value-objects/ids';

/**
 * In-memory {@link StudentSubscriptionRepository} for unit tests. Inherits the
 * soft-deletable base and adds the subscription-specific reads, mirroring the
 * semantics the SQLite adapter must uphold: both exclude tombstones. "Live" = a
 * non-tombstoned subscription row; `listLiveByStudent` sorts newest start first.
 */
export class InMemoryStudentSubscriptionRepository
  extends InMemorySoftDeletableRepository<StudentSubscriptionId, StudentSubscription>
  implements StudentSubscriptionRepository
{
  async listLiveByStudent(studentId: StudentId): Promise<readonly StudentSubscription[]> {
    return this.all()
      .filter((s) => s.deletedAt === null && s.studentId === studentId)
      .sort((a, b) => b.startMonth.localeCompare(a.startMonth));
  }

  async listLiveByStudentAndKind(
    studentId: StudentId,
    kind: GroupKind,
  ): Promise<readonly StudentSubscription[]> {
    return this.all().filter(
      (s) => s.deletedAt === null && s.studentId === studentId && s.kind === kind,
    );
  }

  async listLiveByCenter(centerCode: CenterCode): Promise<readonly StudentSubscription[]> {
    return this.all()
      .filter((s) => s.deletedAt === null && s.centerCode === centerCode)
      .sort((a, b) => b.startMonth.localeCompare(a.startMonth) || a.id.localeCompare(b.id));
  }

  /**
   * Faithful atomic model of the SQLite adapter's `db.transaction` (SOU-141): if
   * writing the created subscription throws, the closed subscription's write is
   * rolled back so the incumbent stays live — the close can never commit without
   * its replacement. An `InMemory` subclass that overrides `save` to throw on a
   * specific id can therefore exercise the rollback path in a unit test.
   */
  async replaceLiveSubscription(
    closed: StudentSubscription,
    created: StudentSubscription,
  ): Promise<void> {
    const before = new Map(this.rows);
    try {
      await this.save(closed);
      await this.save(created);
    } catch (err) {
      this.rows.clear();
      for (const [id, row] of before) this.rows.set(id, structuredClone(row));
      throw err;
    }
  }
}
