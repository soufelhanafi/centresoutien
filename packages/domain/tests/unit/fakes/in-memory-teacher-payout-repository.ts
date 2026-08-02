import { InMemorySoftDeletableRepository } from './in-memory-soft-deletable';
import type { TeacherPayoutRepository } from '../../../src/ports/teacher-payout-repository';
import type { TeacherPayout, TeacherPayoutId } from '../../../src/entities/teacher-payout';
import type { TeacherId } from '../../../src/entities/teacher';
import type { CenterCode } from '../../../src/value-objects/ids';

/**
 * In-memory {@link TeacherPayoutRepository} for unit tests. Inherits the
 * soft-deletable base and adds the `(teacherId, month)` / center+month reads,
 * mirroring the semantics the SQLite adapter must uphold: excludes tombstones.
 */
export class InMemoryTeacherPayoutRepository
  extends InMemorySoftDeletableRepository<TeacherPayoutId, TeacherPayout>
  implements TeacherPayoutRepository
{
  async findLiveByTeacherMonth(teacherId: TeacherId, month: string): Promise<TeacherPayout | null> {
    const found = this.all().find(
      (payout) => payout.deletedAt === null && payout.teacherId === teacherId && payout.month === month,
    );
    return found ?? null;
  }

  async listLiveByCenterMonth(centerCode: CenterCode, month: string): Promise<readonly TeacherPayout[]> {
    return this.all().filter(
      (payout) =>
        payout.deletedAt === null && payout.centerCode === centerCode && payout.month === month,
    );
  }
}
