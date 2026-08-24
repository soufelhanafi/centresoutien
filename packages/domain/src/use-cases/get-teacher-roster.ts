import type { EnrollmentRepository } from '../ports/enrollment-repository';
import type { GroupRepository } from '../ports/group-repository';
import type { StudentRepository } from '../ports/student-repository';
import type { StudentSubscriptionRepository } from '../ports/student-subscription-repository';
import type { SubjectRepository } from '../ports/subject-repository';
import type { TeacherRepository } from '../ports/teacher-repository';
import type { Clock } from '../ports/clock';
import { isSubscriptionActiveInMonth } from '../policies/student-subscription-policy';
import type { PlanPolicy } from '../plans/plan-policy';
import { toEntityId, type CenterCode } from '../value-objects/ids';
import type { Group, GroupId } from '../entities/group';
import type { SubjectId } from '../entities/subject';
import type { StudentId } from '../entities/student';
import type { TeacherId } from '../entities/teacher';
import {
  addPlacement,
  buildGroupRef,
  buildRosterEntry,
  composeFormulaLabel,
  monthOf,
  type BilingualName,
  type StudentPlacement,
  type TeacherRosterEntry,
  type TeacherRosterGroupRef,
} from './teacher-roster-read-model';

export type { TeacherRosterEntry, TeacherRosterGroupRef, TeacherRosterStatus } from './teacher-roster-read-model';

export type GetTeacherRosterInput = { centerCode: CenterCode; teacherId: TeacherId };

/*
 * The roster of students a teacher teaches (SOU-299), for the "Élèves" tab on the
 * teacher detail screen. A teacher is not linked to students directly — the chain
 * is teacher → group(s) → enrolled students — so this read model traverses the
 * teacher's live groups for active placements and, for departed ("Partis") rows,
 * the tombstones attributed to this teacher. It folds everything to one row per
 * distinct student. Gated by `core.teachers`.
 *
 * Center-scoped as defense in depth for the portable core: a teacher, group,
 * enrollment, or student whose `centerCode` differs from the caller's is dropped,
 * exactly as GetGroupRoster does. On desktop the one-DB-per-center boundary makes
 * this redundant; the same use case runs on the future shared-Postgres backend
 * where an id alone is not a tenant guard.
 *
 * A student who is both actively enrolled and separately tombstoned in the
 * teacher's groups resolves to `active` — a current placement always wins over a
 * past one, and only the active groups are shown. A student archived without first
 * being unenrolled is skipped (their record no longer resolves), so the roster
 * never shows a nameless seat — the same trailing-count caveat as the group roster.
 *
 * Departed ("Partis") attribution is by snapshot, never by the group's live teacher
 * (SOU-301). A tombstoned enrollment carries `unenrolledUnderTeacherId` — the
 * teacher who held the group when the student left — found across any group,
 * including groups since reassigned away (listInactiveByFormerTeacher). So a group
 * reassigned A→B keeps A's leavers on A's roster and never moves them onto B's. A
 * tombstone whose snapshot is `null` (a pre-SOU-301 row, or a departure from an
 * unstaffed group) is attributed to no one — the roster never guesses a teacher for
 * it, which would re-introduce the very misattribution SOU-301 fixes.
 */
export class GetTeacherRoster {
  constructor(
    private readonly teachers: TeacherRepository,
    private readonly groups: GroupRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly students: StudentRepository,
    private readonly subjects: SubjectRepository,
    private readonly subscriptions: StudentSubscriptionRepository,
    private readonly clock: Clock,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: GetTeacherRosterInput): Promise<readonly TeacherRosterEntry[]> {
    this.plan.require('core.teachers');

    const teacher = await this.teachers.findById(input.teacherId);
    if (!teacher || teacher.centerCode !== input.centerCode) return [];

    const teacherId = input.teacherId as string;
    const teacherGroups = (await this.groups.listActive(input.centerCode)).filter(
      (group) => group.teacherId !== null && (group.teacherId as string) === teacherId,
    );

    const currentMonth = this.clock.now().toISOString().slice(0, 7);
    const subjectNames = await this.buildSubjectIndex(input.centerCode);
    const placements = await this.collectPlacements(input, teacherGroups, subjectNames);

    const entries = await Promise.all(
      [...placements.values()].map((placement) =>
        this.toEntry(placement, input.centerCode, currentMonth, subjectNames),
      ),
    );

    return entries
      .filter((entry): entry is TeacherRosterEntry => entry !== null)
      .sort((a, b) => a.name.fr.localeCompare(b.name.fr));
  }

  private async buildSubjectIndex(centerCode: CenterCode): Promise<Map<SubjectId, BilingualName>> {
    const subjects = await this.subjects.listAll(centerCode);
    return new Map(subjects.map((subject) => [subject.id, subject.name]));
  }

  private async collectPlacements(
    input: GetTeacherRosterInput,
    teacherGroups: readonly Group[],
    subjectNames: ReadonlyMap<SubjectId, BilingualName>,
  ): Promise<Map<StudentId, StudentPlacement>> {
    const placements = new Map<StudentId, StudentPlacement>();
    const refByGroup = new Map<GroupId, TeacherRosterGroupRef>();

    await this.collectActivePlacements(placements, refByGroup, input.centerCode, teacherGroups, subjectNames);
    await this.collectFormerlyTaught(placements, refByGroup, input, subjectNames);

    return placements;
  }

  // Active placements from the teacher's current groups. Foreign-center enrollments
  // are dropped as defense in depth for the portable core (listActiveByGroup scopes
  // by group id, not center), exactly as GetGroupRoster does.
  private async collectActivePlacements(
    placements: Map<StudentId, StudentPlacement>,
    refByGroup: Map<GroupId, TeacherRosterGroupRef>,
    centerCode: CenterCode,
    teacherGroups: readonly Group[],
    subjectNames: ReadonlyMap<SubjectId, BilingualName>,
  ): Promise<void> {
    for (const group of teacherGroups) {
      const ref = buildGroupRef(group, subjectNames);
      refByGroup.set(group.id, ref);

      const active = (await this.enrollments.listActiveByGroup(group.id)).filter(
        (enrollment) => enrollment.centerCode === centerCode,
      );
      for (const enrollment of active) {
        addPlacement(placements, enrollment, ref, 'active', null);
      }
    }
  }

  // Departed placements attributed by the tombstone's former-teacher snapshot,
  // across any group the teacher held (incl. groups since reassigned away). A
  // tombstone whose group no longer resolves (archived/foreign) is dropped,
  // consistent with the live-groups-only roster.
  private async collectFormerlyTaught(
    placements: Map<StudentId, StudentPlacement>,
    refByGroup: Map<GroupId, TeacherRosterGroupRef>,
    input: GetTeacherRosterInput,
    subjectNames: ReadonlyMap<SubjectId, BilingualName>,
  ): Promise<void> {
    const departed = (
      await this.enrollments.listInactiveByFormerTeacher(toEntityId(input.teacherId))
    ).filter((enrollment) => enrollment.centerCode === input.centerCode);

    for (const enrollment of departed) {
      const ref = await this.resolveGroupRef(enrollment.groupId, refByGroup, input.centerCode, subjectNames);
      if (ref === null) continue;
      addPlacement(placements, enrollment, ref, 'left', monthOf(enrollment.deletedAt));
    }
  }

  private async resolveGroupRef(
    groupId: GroupId,
    refByGroup: Map<GroupId, TeacherRosterGroupRef>,
    centerCode: CenterCode,
    subjectNames: ReadonlyMap<SubjectId, BilingualName>,
  ): Promise<TeacherRosterGroupRef | null> {
    const cached = refByGroup.get(groupId);
    if (cached) return cached;

    const group = await this.groups.findById(groupId);
    if (group === null || group.centerCode !== centerCode) return null;

    const ref = buildGroupRef(group, subjectNames);
    refByGroup.set(groupId, ref);
    return ref;
  }

  private async toEntry(
    placement: StudentPlacement,
    centerCode: CenterCode,
    currentMonth: string,
    subjectNames: ReadonlyMap<SubjectId, BilingualName>,
  ): Promise<TeacherRosterEntry | null> {
    const student = await this.students.findById(placement.studentId);
    if (!student || student.centerCode !== centerCode) return null;

    const formulaLabel = await this.composeFormulaLabel(
      placement.studentId,
      centerCode,
      currentMonth,
      subjectNames,
    );
    return buildRosterEntry(student, placement, formulaLabel);
  }

  private async composeFormulaLabel(
    studentId: StudentId,
    centerCode: CenterCode,
    currentMonth: string,
    subjectNames: ReadonlyMap<SubjectId, BilingualName>,
  ): Promise<BilingualName> {
    // Only the subscription(s) live this month — listLiveByStudent returns
    // non-tombstoned rows including one closed (endMonth) after a formula change;
    // without the month filter a student who switched packs would show the union
    // of their old and new subjects.
    const subscriptions = (await this.subscriptions.listLiveByStudent(studentId)).filter(
      (subscription) =>
        subscription.centerCode === centerCode &&
        isSubscriptionActiveInMonth(subscription, currentMonth),
    );
    return composeFormulaLabel(subscriptions, subjectNames);
  }
}
