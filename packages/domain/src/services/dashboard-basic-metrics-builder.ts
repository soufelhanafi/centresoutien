import type { SessionRepository } from '../ports/session-repository';
import type { StudentRepository } from '../ports/student-repository';
import type { StudentSubscriptionRepository } from '../ports/student-subscription-repository';
import type { InvoiceRepository } from '../ports/invoice-repository';
import type { GroupRepository } from '../ports/group-repository';
import type { EnrollmentRepository } from '../ports/enrollment-repository';
import type { TeacherRepository } from '../ports/teacher-repository';
import type { WeeklyRecurringSessionRepository } from '../ports/weekly-recurring-session-repository';
import type { CenterCode } from '../value-objects/ids';
import { addDays } from '../value-objects/date-range';
import { toMinutes } from '../value-objects/time-of-day';
import { WEEKDAYS } from '../value-objects/weekday';
import { previousMonth } from '../value-objects/month';
import { isSubscriptionActiveInMonth } from '../policies/student-subscription-policy';
import type { Teacher } from '../entities/teacher';
import type { ScheduledSessionRef } from '../errors/scheduling-errors';
import { deltaPercent, groupDisplayName, monthlyMoney } from './dashboard-basic-metrics';
import {
  DASHBOARD_TEACHER_LOAD_TOP_N,
  type DashboardBasicSummary,
  type GroupEnrollmentBar,
  type GroupWithoutSessions,
  type MoneyDelta,
  type TeacherWeeklyLoad,
} from '../read-models/dashboard-basic-summary';

/**
 * Builds the four Basique dashboard widgets from the center's repositories
 * (SOU-177). Each read is bounded by the center's data, never a per-student or
 * per-session row loop — see `GetDashboardBasicSummary`'s contract for the
 * money/week conventions this service is the single implementation of.
 */
export class DashboardBasicMetricsBuilder {
  constructor(private readonly deps: {
    readonly sessions: SessionRepository;
    readonly students: StudentRepository;
    readonly subscriptions: StudentSubscriptionRepository;
    readonly invoices: InvoiceRepository;
    readonly groups: GroupRepository;
    readonly enrollments: EnrollmentRepository;
    readonly teachers: TeacherRepository;
    readonly recurringSessions: WeeklyRecurringSessionRepository;
  }) {}

  async buildArgent(
    centerCode: CenterCode,
    month: string,
  ): Promise<DashboardBasicSummary['argent']> {
    const [currentPage, previousPage] = await Promise.all([
      this.deps.invoices.listInvoices(centerCode, { month }),
      this.deps.invoices.listInvoices(centerCode, { month: previousMonth(month) }),
    ]);
    const current = monthlyMoney(currentPage.rows);
    const previous = monthlyMoney(previousPage.rows);
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
      },
    };
  }

  async buildEffectifs(
    centerCode: CenterCode,
    month: string,
  ): Promise<DashboardBasicSummary['effectifs']> {
    const [activeStudentCount, liveGroups, liveSubscriptions, liveStudents] = await Promise.all([
      this.deps.students.countActive(centerCode),
      this.deps.groups.listActive(centerCode),
      this.deps.subscriptions.listLiveByCenter(centerCode),
      this.deps.students.listActive(centerCode),
    ]);

    const groupCount = liveGroups.length;
    const averageStudentsPerGroup =
      groupCount === 0 ? 0 : Math.round((activeStudentCount / groupCount) * 10) / 10;

    const enrolledByGroup = await this.deps.enrollments.countActiveByGroups(
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

  async buildTeacherWeeklyLoad(
    centerCode: CenterCode,
    weekStart: string,
  ): Promise<readonly TeacherWeeklyLoad[]> {
    const weekEnd = addDays(weekStart, 6);
    const [weekSessions, liveTeachers] = await Promise.all([
      this.deps.sessions.listForRange(centerCode, { start: weekStart, end: weekEnd }),
      this.deps.teachers.listActive(centerCode),
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
      loads.push({ teacherId: teacher.id, teacherName: teacher.name, weeklyMinutes });
    }

    return loads.sort((a, b) => b.weeklyMinutes - a.weeklyMinutes).slice(0, DASHBOARD_TEACHER_LOAD_TOP_N);
  }

  async buildSeances(
    centerCode: CenterCode,
    weekStart: string,
  ): Promise<DashboardBasicSummary['seances']> {
    const weekEnd = addDays(weekStart, 6);
    const [weekSessions, liveGroups, allRecurringRefs] = await Promise.all([
      this.deps.sessions.listForRange(centerCode, { start: weekStart, end: weekEnd }),
      this.deps.groups.listActive(centerCode),
      this.listAllRecurringRefs(centerCode),
    ]);

    const plannedMinutes = allRecurringRefs.reduce(
      (sum, ref) => sum + (toMinutes(ref.end) - toMinutes(ref.start)),
      0,
    );

    const groupIdsWithSession = new Set<string>();
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
      WEEKDAYS.map((day) => this.deps.recurringSessions.listRefsForDay(centerCode, day)),
    );
    return perDay.flat();
  }
}
