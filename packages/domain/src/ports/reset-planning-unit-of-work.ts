import type { Session } from '../entities/session';
import type { WeeklyRecurringSession } from '../entities/weekly-recurring-session';
import type { UserId } from '../value-objects/ids';

/**
 * The narrow, atomic commit seam for
 * {@link import('../use-cases/reset-planning').ResetPlanning} (SOU-295). The use
 * case enumerates EVERY row the reset tombstones — every live future
 * {@link Session} occurrence from the cutoff forward, and every live
 * {@link WeeklyRecurringSession} template of the center — and hands both sets,
 * plus the single `deletedAt` (from the injected `Clock`, UTC) and `updatedBy`
 * to stamp on each, to this ONE method.
 *
 * The SQLite adapter soft-deletes all of it inside a single transaction, so a
 * failure partway through rolls the WHOLE reset back: never a center left with
 * its future sessions cleared but its templates intact (which would let the
 * generator re-materialise the cleared planning), nor the reverse. Past/attended
 * sessions are never in `sessions` — the use case excludes `date < cutoffDate`
 * before building the unit, so payroll attribution inputs survive.
 *
 * Deliberately narrow (like {@link import('./merge-parents-unit-of-work').MergeParentsUnit}):
 * it receives the live rows plus the tombstone stamp and translates them to
 * soft-delete writes + sync change-log rows, carrying no business decision of its
 * own. No hard delete — these are ordinary soft-deletes and sync tombstones.
 */
export type ResetPlanningUnit = {
  /** Live future occurrences to tombstone. */
  readonly sessions: readonly Session[];
  /** Live recurring templates to tombstone. */
  readonly templates: readonly WeeklyRecurringSession[];
  /** The tombstone timestamp (Clock, UTC) stamped as `deletedAt` and `updatedAt` on every row. */
  readonly deletedAt: Date;
  /** Who ran the reset — recorded as `updatedBy` for the delete-vs-edit conflict UI. */
  readonly updatedBy: UserId;
};

export interface ResetPlanningUnitOfWork {
  /** Soft-delete every session and template in the unit atomically. Must not partially apply on failure. */
  commit(unit: ResetPlanningUnit): Promise<void>;
}
