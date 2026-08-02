import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { TeacherPayout, TeacherPayoutId } from '../entities/teacher-payout';
import type { TeacherId } from '../entities/teacher';
import type { CenterCode } from '../value-objects/ids';

/**
 * Persistence port for TeacherPayouts (SOU-74). Inherits the soft-deletable
 * surface (`save` / `findById` / `softDelete` / `listChangedSince`); reads
 * exclude tombstones, and there is no hard delete. `save` is the sole write
 * path for both the initial insert and the compute job's in-place draft-amount
 * update — there is no separate "confirm to paid" method here, since that
 * transition belongs to SOU-76.
 *
 * Not people-like: a payout is identified by its `(teacherId, month)`
 * relationship, so there is no `findByNaturalKey`.
 */
export interface TeacherPayoutRepository
  extends SoftDeletableRepository<TeacherPayoutId, TeacherPayout> {
  /**
   * The live payout for `(teacherId, month)`, or `null` — the idempotency key
   * `ComputeMonthlyPayrolls` upserts against. Deliberately a domain read, not a
   * DB unique index (same rationale as `InvoiceRepository.findByStudentMonth`):
   * two laptops computing the same month before a sync must converge on
   * sync-resolve rather than reject the push.
   */
  findLiveByTeacherMonth(teacherId: TeacherId, month: string): Promise<TeacherPayout | null>;

  /** Every live payout for the center in `month` — the payroll dashboard (SOU-76). */
  listLiveByCenterMonth(centerCode: CenterCode, month: string): Promise<readonly TeacherPayout[]>;
}
