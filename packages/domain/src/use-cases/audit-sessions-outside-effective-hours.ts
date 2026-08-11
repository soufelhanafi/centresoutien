import type { SessionOccurrenceViewReadPort } from '../ports/session-occurrence-view-read-port';
import type { Clock } from '../ports/clock';
import type { HolidayRepository } from '../ports/holiday-repository';
import type { CenterHoursRepository } from '../ports/center-hours-repository';
import type { CenterHoursOverrideRepository } from '../ports/center-hours-override-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { SessionOccurrenceView } from '../read-models/session-occurrence-view';
import type { HolidayOccurrence } from '../policies/holiday-policy';
import type { CenterHoursOverride } from '../entities/center-hours-override';
import type { DayHours } from '../policies/session-conflict-policy';
import type { WeekdayIndex } from '../value-objects/weekday';
import { SessionConflictPolicy } from '../policies/session-conflict-policy';
import { resolveEffectiveWindows } from '../policies/center-hours-override-policy';
import { holidayOn } from '../policies/holiday-policy';
import { weekdayOf } from '../value-objects/date-range';

/**
 * Why a materialized session no longer sits in any valid window. A stranded
 * occurrence carries exactly one reason: `on-holiday` wins when a holiday now
 * covers its date (the center is closed the whole day, so its opening windows
 * are moot), otherwise `outside-center-hours` when its fixed `[start, end]` no
 * longer fits the effective windows resolved for that date.
 */
export type SessionAuditReason = 'outside-center-hours' | 'on-holiday';

/**
 * One occurrence the audit flags: the enriched {@link SessionOccurrenceView}
 * (display-ready — room/teacher/subject/group names, level, kind, and the raw
 * date/time) paired with the reason it is now stranded.
 */
export type StrandedSession = {
  session: SessionOccurrenceView;
  reason: SessionAuditReason;
};

export type AuditSessionsOutsideEffectiveHoursResult = {
  sessionsOutsideEffectiveHours: StrandedSession[];
};

export type AuditSessionsOutsideEffectiveHoursInput = {
  centerCode: CenterCode;
};

/**
 * Read-only, center-wide sweep (SOU-201) that reports every live materialized
 * session the *current* effective center hours or holidays now place outside any
 * valid window — the drift that opens up when a center-hours override (SOU-165)
 * or a holiday (SOU-161) is added *after* the sessions were generated. It never
 * mutates or deletes: cancelling a stranded occurrence is `CancelSession`, the
 * separate per-occurrence soft-delete; this only surfaces the candidates.
 *
 * It reads enriched occurrences through {@link SessionOccurrenceViewReadPort} so
 * each result already carries the display fields the report renders (room,
 * teacher, subject, group, level, kind) — the renderer never re-joins. That port
 * also excludes cancelled (soft-deleted) rows, so a just-cancelled occurrence
 * never reappears in the next audit.
 *
 * The verdict per occurrence reuses the same policy logic interactive scheduling
 * already trusts, never a parallel reimplementation:
 * - {@link holidayOn} decides the holiday case (fixed vs lunar recurrence math),
 * - {@link resolveEffectiveWindows} resolves the date's windows with override
 *   precedence over static hours (an override covering the date wins; otherwise
 *   the static weekday hours apply; `null` means the center configured no hours
 *   for that date and the audit imposes no hours constraint — exactly the
 *   generator's pre-SOU-165 stance), and
 * - {@link SessionConflictPolicy.withinWindows} performs the pure fit test.
 *
 * Holiday takes precedence over hours so each stranded occurrence carries one
 * unambiguous reason, mirroring the generator's own order (it skips a holiday
 * date before ever hours-checking it). Scoped to one center; the reads never
 * cross a tenant boundary. Rides under `settings.center-hours` (every plan) — the
 * audit exists to explain the effect of a center-hours/holiday change, so it
 * shares that feature's gate rather than adding a new flag.
 *
 * The sweep is bounded to today-and-forward (UTC civil date from the injected
 * `Clock`): the report is a call to action on sessions that will still happen,
 * so a past occurrence — which may already carry recorded attendance — is never
 * surfaced or offered for cancellation.
 */
export class AuditSessionsOutsideEffectiveHours {
  constructor(
    private readonly occurrences: SessionOccurrenceViewReadPort,
    private readonly holidays: HolidayRepository,
    private readonly centerHours: CenterHoursRepository,
    private readonly overrides: CenterHoursOverrideRepository,
    private readonly plan: PlanPolicy,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: AuditSessionsOutsideEffectiveHoursInput,
  ): Promise<AuditSessionsOutsideEffectiveHoursResult> {
    this.plan.require('settings.center-hours');

    const [sessions, holidays, week, overrides] = await Promise.all([
      this.occurrences.listActiveOccurrenceViews(input.centerCode),
      this.holidays.listActive(input.centerCode),
      this.centerHours.listForCenter(input.centerCode),
      this.overrides.listForCenter(input.centerCode),
    ]);

    const staticDayByWeekday = new Map<WeekdayIndex, DayHours>(
      week.map((day) => [day.dayOfWeek, day]),
    );

    const today = this.clock.now().toISOString().slice(0, 10);
    const sessionsOutsideEffectiveHours: StrandedSession[] = [];
    for (const session of sessions) {
      if (session.date < today) continue;
      const reason = this.reasonFor(session, holidays, overrides, staticDayByWeekday);
      if (reason !== null) sessionsOutsideEffectiveHours.push({ session, reason });
    }
    return { sessionsOutsideEffectiveHours };
  }

  private reasonFor(
    session: SessionOccurrenceView,
    holidays: readonly HolidayOccurrence[],
    overrides: readonly CenterHoursOverride[],
    staticDayByWeekday: ReadonlyMap<WeekdayIndex, DayHours>,
  ): SessionAuditReason | null {
    if (holidayOn(session.date, holidays) !== null) return 'on-holiday';
    const weekday = weekdayOf(session.date);
    const staticDay = staticDayByWeekday.get(weekday) ?? null;
    const windows = resolveEffectiveWindows(session.date, weekday, overrides, staticDay);
    if (windows === null) return null;
    const outside = SessionConflictPolicy.withinWindows(
      { dayOfWeek: weekday, start: session.start, end: session.end },
      windows,
    );
    return outside === null ? null : 'outside-center-hours';
  }
}
