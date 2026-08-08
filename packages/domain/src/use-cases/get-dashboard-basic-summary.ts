import type { SessionRepository } from '../ports/session-repository';
import type { StudentRepository } from '../ports/student-repository';
import type { StudentSubscriptionRepository } from '../ports/student-subscription-repository';
import type { InvoiceRepository } from '../ports/invoice-repository';
import type { GroupRepository } from '../ports/group-repository';
import type { EnrollmentRepository } from '../ports/enrollment-repository';
import type { TeacherRepository } from '../ports/teacher-repository';
import type { WeeklyRecurringSessionRepository } from '../ports/weekly-recurring-session-repository';
import type { Clock } from '../ports/clock';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import { previousMonth } from '../value-objects/month';
import { addDays, weekdayOf } from '../value-objects/date-range';
import { toMinutes } from '../value-objects/time-of-day';
import { WEEKDAYS } from '../value-objects/weekday';
import { paymentStatusOf } from '../policies/payment-status';
import { isSubscriptionActiveInMonth } from '../policies/student-subscription-policy';
import type { Group, GroupId } from '../entities/group';
import type { Teacher } from '../entities/teacher';
import type { InvoiceListRow } from '../read-models/invoice-list-row';
import type { ScheduledSessionRef } from '../errors/scheduling-errors';
import {
  DASHBOARD_TEACHER_LOAD_TOP_N,
  type DashboardBasicSummary,
  type GroupEnrollmentBar,
  type GroupWithoutSessions,
  type MoneyDelta,
  type TeacherWeeklyLoad,
} from '../read-models/dashboard-basic-summary';

export type GetDashboardBasicSummaryInput = {
  centerCode: CenterCode;
};

type MonthlyMoney = {
  billedMad: number;
  collectedMad: number;
  unpaidMad: number;
  paidCount: number;
  totalCount: number;
};

function mondayOfWeek(now: Date): string {
  const today = now.toISOString().slice(0, 10);
  const daysSinceMonday = (weekdayOf(today) + 6) % 7;
  return addDays(today, -daysSinceMonday);
}

function deltaPercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** The money roll-up one month contributes, over `issued` invoices only. */
function monthlyMoney(rows: readonly InvoiceListRow[]): MonthlyMoney {
  let billedMad = 0;
  let collectedMad = 0;
  let paidCount = 0;
  let totalCount = 0;
  for (const row of rows) {
    if (row.invoice.status !== 'issued') continue;
    billedMad += row.totalMad;
    collectedMad += row.netPaidMad;
    totalCount += 1;
    if (paymentStatusOf(row.totalMad, row.netPaidMad) === 'paid') paidCount += 1;
  }
  return { billedMad, collectedMad, unpaidMad: billedMad - collectedMad, paidCount, totalCount };
}

/** A Group has no translated name of its own — its plain `level` string is
 *  duplicated into both scripts, the same convention `subjectUsageReference` uses. */
function groupDisplayName(group: Group): { fr: string; ar: string } {
  return { fr: group.level, ar: group.level };
}

/**
 * The Basique dashboard's four cards — Argent, Effectifs, Charge enseignants,
 * Séances (SOU-177), gated by `dashboard.basic` (every plan). All reads run in
 * parallel and each is bounded by the center's data, not by student count
 * row-by-row:
 *
 * - **Argent**: two `InvoiceRepository.listInvoices` calls (current month +
 *   previous), rolled up by `monthlyMoney` — the same "recognized to billed
 *   month" convention as `GetDashboardAdvancedSummary`, so the two dashboards
 *   can never disagree on a month's money.
 * - **Effectifs**: `countActive` + one `listActive` of students, one
 *   `listActive` of groups, one `countActiveByGroups` batch for every group's
 *   enrollment bar, and one `listLiveByCenter` of subscriptions filtered
 *   through `isSubscriptionActiveInMonth` (the same rule
 *   `GenerateMonthlyInvoices` uses) — never a per-group or per-student loop.
 * - **Charge enseignants**: one `listForRange` of the week's sessions + one
 *   `listActive` of teachers, summed in memory; teachers with no session this
 *   week are omitted, the rest are capped at {@link DASHBOARD_TEACHER_LOAD_TOP_N}.
 * - **Séances**: one `listForRange` of the week, one `listActive` of groups,
 *   and `plannedMinutes` derived from all live recurring sessions via one
 *   `listRefsForDay` read per weekday (each live session falls on exactly one
 *   weekday, so the union is exact). `groupsWithoutSessions` is a pure
 *   in-memory diff of the two lists.
 */
export class GetDashboardBasicSummary {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly students: StudentRepository,
    private readonly subscriptions: StudentSubscriptionRepository,
    private readonly invoices: InvoiceRepository,
    private readonly groups: GroupRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly teachers: TeacherRepository,
    private readonly recurringSessions: WeeklyRecurringSessionRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetDashboardBasicSummaryInput): Promise<DashboardBasicSummary> {
    this.plan.require('dashboard.basic');

    const now = this.clock.now();
    const month = now.toISOString().slice(0, 7);
    const weekStart = mondayOfWeek(now);

    const [argent, effectifs, teacherWeeklyLoad, seances] = await Promise.all([
      this.buildArgent(input.centerCode, month),
      this.buildEffectifs(input.centerCode, month),
      this.buildTeacherWeeklyLoad(input.centerCode, weekStart),
      this.buildSeances(input.centerCode, weekStart),
    ]);

    return { argent, effectifs, teacherWeeklyLoad, seances };
  }

  private async buildArgent(
    centerCode: CenterCode,
    month: string,
  ): Promise<DashboardBasicSummary['argent']> {
    const prevMonth = previousMonth(month);
    const [currentRows, previousRows] = await Promise.all([
      this.invoices.listInvoices(centerCode, { month }),
      this.invoices.listInvoices(centerCode, { month: prevMonth }),
    ]);
    const current = monthlyMoney(currentRows);
    const previous = monthlyMoney(previousRows);
    const delta = (value: number, baseline: number): MoneyDelta => ({
      deltaPercent: deltaPercent(value, baseline),
    });
    return {
      month,
      billedMad: current.billedMad,
      collectedMad: current.collectedMad,
      unpaidMad: current.unpaidMad,
      paidInvoices: { paidCount: current.paidCount, totalCount: current.totalCount },
      prevMonth: {
        billedMad: previous.billedMad,
        collectedMad: previous.collectedMad,
        unpaidMad: previous.unpaidMad,
      },
      deltas: {
        billed: delta(current.billedMad, previous.billedMad),
        collected: delta(current.collectedMad, previous.collectedMad),
        unpaid: delta(current.unpaidMad, previous.unpaidMad),
      },
    };
  }

  private async buildEffectifs(
    centerCode: CenterCode,
    month: string,
  ): Promise<DashboardBasicSummary['effectifs']> {
    const [activeStudentCount, liveGroups, liveSubscriptions, liveStudents] = await Promise.all([
      this.students.countActive(centerCode),
      this.groups.listActive(centerCode),
      this.subscriptions.listLiveByCenter(centerCode),
      this.students.listActive(centerCode),
    ]);

    const groupCount = liveGroups.length;
    const averageStudentsPerGroup =
      groupCount === 0 ? 0 : Math.round((activeStudentCount / groupCount) * 10) / 10;

    const enrolledByGroup = await this.enrollments.countActiveByGroups(
      liveGroups.map((group) => group.id),
    );
    const groupBars: GroupEnrollmentBar[] = liveGroups
      .map((group) => ({
        groupId: group.id,
        groupName: groupDisplayName(group),
        kind: group.kind,
        enrolledCount: enrolledByGroup.get(group.id) ?? 0,
        capacity: group.capacity,
      }))
      .sort((a, b) => b.enrolledCount - a.enrolledCount);

    const subscribedStudentIds = new Set(
      liveSubscriptions
        .filter((subscription) => isSubscriptionActiveInMonth(subscription, month))
        .map((subscription) => subscription.studentId),
    );
    const unenrolledStudentCount = liveStudents.filter(
      (student) => !subscribedStudentIds.has(student.id),
    ).length;

    return { activeStudentCount, groupCount, averageStudentsPerGroup, unenrolledStudentCount, groupBars };
  }

  private async buildTeacherWeeklyLoad(
    centerCode: CenterCode,
    weekStart: string,
  ): Promise<readonly TeacherWeeklyLoad[]> {
    const weekEnd = addDays(weekStart, 6);
    const [weekSessions, liveTeachers] = await Promise.all([
      this.sessions.listForRange(centerCode, { start: weekStart, end: weekEnd }),
      this.teachers.listActive(centerCode),
    ]);

    const minutesByTeacher = new Map<string, number>();
    for (const session of weekSessions) {
      if (session.teacherId === null) continue;
      const durationMinutes = toMinutes(session.end) - toMinutes(session.start);
      minutesByTeacher.set(session.teacherId, (minutesByTeacher.get(session.teacherId) ?? 0) + durationMinutes);
    }

    const teacherById = new Map<string, Teacher>(liveTeachers.map((teacher) => [teacher.id, teacher]));

    const loads: TeacherWeeklyLoad[] = [];
    for (const [teacherId, weeklyMinutes] of minutesByTeacher) {
      const teacher = teacherById.get(teacherId);
      if (teacher === undefined) continue;
      loads.push({ teacherId, teacherName: teacher.name, weeklyMinutes });
    }

    return loads.sort((a, b) => b.weeklyMinutes - a.weeklyMinutes).slice(0, DASHBOARD_TEACHER_LOAD_TOP_N);
  }

  private async buildSeances(
    centerCode: CenterCode,
    weekStart: string,
  ): Promise<DashboardBasicSummary['seances']> {
    const weekEnd = addDays(weekStart, 6);
    const [weekSessions, liveGroups, allRecurringRefs] = await Promise.all([
      this.sessions.listForRange(centerCode, { start: weekStart, end: weekEnd }),
      this.groups.listActive(centerCode),
      this.listAllRecurringRefs(centerCode),
    ]);

    const plannedMinutes = allRecurringRefs.reduce(
      (sum, ref) => sum + (toMinutes(ref.end) - toMinutes(ref.start)),
      0,
    );

    const groupIdsWithSession = new Set<GroupId>();
    for (const session of weekSessions) {
      if (session.groupId !== null) groupIdsWithSession.add(session.groupId);
    }

    const groupsWithoutSessions: GroupWithoutSessions[] = liveGroups
      .filter((group) => !groupIdsWithSession.has(group.id))
      .map((group) => ({ groupId: group.id, groupName: groupDisplayName(group), kind: group.kind }));

    return { weekStart, weekSessionCount: weekSessions.length, plannedMinutes, groupsWithoutSessions };
  }

  private async listAllRecurringRefs(centerCode: CenterCode): Promise<readonly ScheduledSessionRef[]> {
    const perDay = await Promise.all(
      WEEKDAYS.map((day) => this.recurringSessions.listRefsForDay(centerCode, day)),
    );
    return perDay.flat();
  }
}
