import type { SoftDeletableRepository } from '../repositories/soft-deletable';
import type { Formula, FormulaId } from '../entities/formula';
import type { CenterCode } from '../value-objects/ids';

/**
 * Persistence port for Formulas. Extends the soft-deletable surface
 * (`save` / `findById` / `softDelete` / `listChangedSince`; reads exclude
 * tombstones, no hard delete) with the center-scoped active-picker list
 * `CreateStudentSubscription` and the new-formula UI need (mirrors
 * `SubjectRepository.listActive`).
 *
 * `save()` never writes `isImmutable` — the SQLite trigger (SOU-61) is the sole
 * writer of that column, flipped the moment an `InvoiceLine` first references the
 * formula. A caller that tries to save a content patch onto an immutable formula
 * has already been rejected by `updateFormula` (`policies/formula-policy.ts`)
 * before the adapter is ever reached; the DB-level guard trigger is the safety net.
 */
export interface FormulaRepository extends SoftDeletableRepository<FormulaId, Formula> {
  /**
   * The center's currently **active** formulas — the picker set: live
   * (non-tombstoned) rows whose `active` flag is true. Backs new-subscription
   * pickers, which must not offer a deactivated formula. Center-scoped.
   */
  listActive(centerCode: CenterCode): Promise<readonly Formula[]>;
}
