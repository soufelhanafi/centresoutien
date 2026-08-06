import type {
  MergeStudentsUnitOfWork,
  MergeStudentsUnit,
  StudentDependents,
} from '../../../src/ports/merge-students-unit-of-work';
import type { Student, StudentId } from '../../../src/entities/student';
import type { Enrollment } from '../../../src/entities/enrollment';
import type { StudentSubscription } from '../../../src/entities/student-subscription';
import type { AttendanceRecord } from '../../../src/entities/attendance-record';
import type { Invoice } from '../../../src/entities/invoice';
import type { MergeLogEntry } from '../../../src/entities/merge-log';
import type { CenterCode } from '../../../src/value-objects/ids';
import type { InMemoryStudentRepository } from './in-memory-student-repository';
import type { InMemoryEnrollmentRepository } from './in-memory-enrollment-repository';
import type { InMemoryStudentSubscriptionRepository } from './in-memory-student-subscription-repository';
import type { InMemoryAttendanceRepository } from './in-memory-attendance-repository';
import type { InMemoryInvoiceRepository } from './in-memory-invoice-repository';
import type { InMemoryMergeLogRepository } from './in-memory-merge-log-repository';

/**
 * In-memory {@link MergeStudentsUnitOfWork} for unit tests. `listDependents`
 * reads the loser's live dependent rows from the same in-memory repositories the
 * test seeded (attendance/invoices filter the shared soft-deletable base — the
 * SQLite adapter scopes by center in SQL). `commit` applies the whole unit
 * atomically: winner, loser tombstone, re-pointed dependents and the merge log
 * are written together, and a failure at any step restores the prior snapshot so
 * nothing is left half-merged. `failAfterWrites` simulates a dependent re-point
 * write failing after the student rows already went in — the SOU-169 rollback path.
 */
export class InMemoryMergeStudentsUnitOfWork implements MergeStudentsUnitOfWork {
  /** Number of `commit` calls — lets tests prove the use case calls it exactly once. */
  commits = 0;
  /** The last unit handed to `commit` — lets tests inspect exactly what was written. */
  lastUnit: MergeStudentsUnit | null = null;

  constructor(
    private readonly students: InMemoryStudentRepository,
    private readonly enrollments: InMemoryEnrollmentRepository,
    private readonly subscriptions: InMemoryStudentSubscriptionRepository,
    private readonly attendance: InMemoryAttendanceRepository,
    private readonly invoices: InMemoryInvoiceRepository,
    private readonly mergeLogs: InMemoryMergeLogRepository,
    private readonly failAfterWrites = false,
  ) {}

  async listDependents(centerCode: CenterCode, loserId: StudentId): Promise<StudentDependents> {
    void centerCode;
    return {
      enrollments: await this.enrollments.listActiveByStudent(loserId),
      subscriptions: await this.subscriptions.listLiveByStudent(loserId),
      attendance: this.attendance.all().filter((row) => row.deletedAt === null && row.studentId === loserId),
      invoices: this.invoices.all().filter((row) => row.deletedAt === null && row.studentId === loserId),
    };
  }

  async listLiveSubscriptions(
    centerCode: CenterCode,
    studentIds: readonly StudentId[],
  ): Promise<readonly StudentSubscription[]> {
    void centerCode;
    return this.subscriptions
      .all()
      .filter((s) => s.deletedAt === null && studentIds.includes(s.studentId));
  }

  async commit(unit: MergeStudentsUnit): Promise<void> {
    this.commits += 1;
    this.lastUnit = unit;
    const before = this.snapshot();
    try {
      await this.students.save(unit.winner);
      await this.students.save(unit.loser);
      if (this.failAfterWrites) throw new Error('simulated dependent re-point failure');
      for (const row of unit.repointed.enrollments) await this.enrollments.save(row);
      for (const row of unit.repointed.subscriptions) await this.subscriptions.save(row);
      for (const row of unit.repointed.attendance) await this.attendance.save(row);
      for (const row of unit.repointed.invoices) await this.invoices.save(row);
      await this.mergeLogs.record(unit.mergeLog);
    } catch (err) {
      await this.restore(before);
      throw err;
    }
  }

  private snapshot(): Record<string, readonly unknown[]> {
    return {
      students: this.students.all(),
      enrollments: this.enrollments.all(),
      subscriptions: this.subscriptions.all(),
      attendance: this.attendance.all(),
      invoices: this.invoices.all(),
      logs: this.mergeLogs.all(),
    };
  }

  private async restore(snap: Record<string, readonly unknown[]>): Promise<void> {
    const students = snap['students'] as readonly Student[];
    this.students.clear();
    for (const row of students) await this.students.save(row);

    const enrollments = snap['enrollments'] as readonly Enrollment[];
    this.enrollments.clear();
    for (const row of enrollments) await this.enrollments.save(row);

    const subscriptions = snap['subscriptions'] as readonly StudentSubscription[];
    this.subscriptions.clear();
    for (const row of subscriptions) await this.subscriptions.save(row);

    const attendance = snap['attendance'] as readonly AttendanceRecord[];
    this.attendance.clear();
    for (const row of attendance) await this.attendance.save(row);

    const invoices = snap['invoices'] as readonly Invoice[];
    this.invoices.clear();
    for (const row of invoices) await this.invoices.save(row);

    const logs = snap['logs'] as readonly MergeLogEntry[];
    this.mergeLogs.clear();
    for (const row of logs) await this.mergeLogs.record(row);
  }
}
