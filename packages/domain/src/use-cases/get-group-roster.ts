import type { EnrollmentRepository } from '../ports/enrollment-repository';
import type { StudentRepository } from '../ports/student-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { GroupId } from '../entities/group';
import type { EnrollmentId } from '../entities/enrollment';
import type { StudentId } from '../entities/student';

export type GetGroupRosterInput = { centerCode: CenterCode; groupId: GroupId };

/**
 * One line of a group's roster: the enrollment that seats the student (its `id`
 * is what the detail screen's unenroll action needs) plus the student resolved to
 * a display name. Envelope-free — this is a read-model row, not an entity.
 */
export type GroupRosterEntry = {
  enrollmentId: EnrollmentId;
  studentId: StudentId;
  name: { fr: string; ar: string };
  level: string;
  /** The enrollment's inclusive `YYYY-MM` start — "enrolled since" on the roster. */
  startMonth: string;
};

/**
 * The active roster of a group for its detail screen (SOU-127): the live
 * enrollments (`listActiveByGroup` already hides unenrolled/tombstoned rows)
 * resolved to student names via the student read model. Gated by `core.groups`.
 *
 * **Center-scoped** as defense in depth for the portable core: enrollments and
 * students whose `centerCode` differs from the caller's are dropped. On desktop
 * the one-DB-per-center boundary makes this redundant, but the same use case runs
 * on the future shared-Postgres backend where an id alone is not a tenant guard.
 *
 * A row whose student cannot be resolved to a live record — e.g. the student was
 * archived without first being unenrolled — is skipped, so the roster never shows
 * a nameless seat. This is the rare case where the roster length can trail the
 * `enrolledCount` (which counts live enrollment rows, students live or not).
 *
 * The N student lookups are bounded by the group's capacity (tens), so resolving
 * the roster of a **single** group per call needs no batch read — unlike the group
 * list, whose per-row counts must be batched.
 */
export class GetGroupRoster {
  constructor(
    private readonly enrollments: EnrollmentRepository,
    private readonly students: StudentRepository,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetGroupRosterInput): Promise<readonly GroupRosterEntry[]> {
    this.plan.require('core.groups');

    const enrollments = (await this.enrollments.listActiveByGroup(input.groupId)).filter(
      (enrollment) => enrollment.centerCode === input.centerCode,
    );

    const entries = await Promise.all(
      enrollments.map(async (enrollment): Promise<GroupRosterEntry | null> => {
        const student = await this.students.findById(enrollment.studentId);
        if (!student || student.centerCode !== input.centerCode) return null;
        return {
          enrollmentId: enrollment.id,
          studentId: student.id,
          name: { fr: student.name.fr, ar: student.name.ar },
          level: student.level,
          startMonth: enrollment.startMonth,
        };
      }),
    );

    return entries
      .filter((entry): entry is GroupRosterEntry => entry !== null)
      .sort((a, b) => a.name.fr.localeCompare(b.name.fr));
  }
}
