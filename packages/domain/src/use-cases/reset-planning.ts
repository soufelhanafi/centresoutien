import type { SessionRepository } from '../ports/session-repository';
import type { WeeklyRecurringSessionRepository } from '../ports/weekly-recurring-session-repository';
import type { ResetPlanningUnitOfWork } from '../ports/reset-planning-unit-of-work';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode, UserId } from '../value-objects/ids';

export type ResetPlanningInput = {
  centerCode: CenterCode;
  /**
   * Inclusive lower bound `YYYY-MM-DD`: every live session on or after this date
   * is cleared. Presentation derives it from the injected `Clock` (today to
   * include today, tomorrow to start from tomorrow); the domain never reads a
   * wall clock, the cutoff arrives as data.
   */
  cutoffDate: string;
  updatedBy: UserId;
};

export type ResetPlanningResult = {
  /** How many future occurrences were soft-deleted (the toast reports this as "N séances"). */
  sessionsDeleted: number;
  /** How many recurring templates were soft-deleted. */
  templatesDeleted: number;
};

/**
 * Director-facing danger-zone bulk clear of a center's future planning (SOU-295).
 * In ONE atomic unit it soft-deletes every live {@link Session} occurrence dated
 * on or after `cutoffDate`, and every live {@link WeeklyRecurringSession} template
 * of the center, so future regeneration cannot re-materialise the cleared grid
 * (the generator skips tombstoned templates). Gated by `core.calendar.week` — the
 * same feature that gates the calendar the reset acts on.
 *
 * **Past/attended sessions are never touched.** {@link SessionRepository.listLiveFrom}
 * returns only live, UNATTENDED occurrences on or after the cutoff: past sessions
 * (`date < cutoffDate`) are excluded, and so is any session that already has a
 * recorded attendance — even one earlier on the cutoff day itself. Those stay live
 * and keep feeding {@link TeacherFeeAttributionPolicy} / payroll (their attendance
 * joins against `sessions.deleted_at IS NULL`, so tombstoning them would silently
 * erase it from reports). Template removal is a GLOBAL wipe (every live template of
 * the center) — there is no per-group, per-room, per-teacher, or date-range filter.
 *
 * **Soft delete only.** Both sets become `deletedAt` tombstones stamped with the
 * injected `Clock`'s UTC `now` and `updatedBy` (who ran the reset — needed for the
 * delete-vs-edit conflict UI), never a hard `DELETE`. The two soft-delete sets are
 * committed through {@link ResetPlanningUnitOfWork} in a single transaction, so a
 * failure can never leave sessions cleared while templates survive (or vice
 * versa). These are ordinary sync tombstones; nothing about sync is special-cased.
 *
 * Only live rows are read, so the result counts reflect exactly what this call
 * cleared — already-tombstoned rows are excluded by the reads and never
 * re-processed. An empty center returns `{ sessionsDeleted: 0, templatesDeleted: 0 }`.
 */
export class ResetPlanning {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly templates: WeeklyRecurringSessionRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
    private readonly unitOfWork: ResetPlanningUnitOfWork,
  ) {}

  async execute(input: ResetPlanningInput): Promise<ResetPlanningResult> {
    this.plan.require('core.calendar.week');

    const futureSessions = await this.sessions.listLiveFrom(input.centerCode, input.cutoffDate);
    const liveTemplates = await this.templates.listActive(input.centerCode);

    await this.unitOfWork.commit({
      sessions: futureSessions,
      templates: liveTemplates,
      deletedAt: this.clock.now(),
      updatedBy: input.updatedBy,
    });

    return {
      sessionsDeleted: futureSessions.length,
      templatesDeleted: liveTemplates.length,
    };
  }
}
