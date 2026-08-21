import type { EnrollmentRepository } from '../ports/enrollment-repository';
import type { GroupRepository } from '../ports/group-repository';
import type { StudentRepository } from '../ports/student-repository';
import type { StudentSubscriptionRepository } from '../ports/student-subscription-repository';
import type { SubjectRepository } from '../ports/subject-repository';
import type { TeacherRepository } from '../ports/teacher-repository';
import type { PlanPolicy } from '../plans/plan-policy';
import type { CenterCode } from '../value-objects/ids';
import type { Enrollment } from '../entities/enrollment';
import type { Group, GroupId, GroupKind } from '../entities/group';
import type { SubjectId } from '../entities/subject';
import type { StudentId } from '../entities/student';
import type { TeacherId } from '../entities/teacher';

export type GetTeacherRosterInput = { centerCode: CenterCode; teacherId: TeacherId };

type BilingualName = { fr: string; ar: string };

/** One of the teacher's groups the student sits in, named for display/filtering. */
export type TeacherRosterGroupRef = {
  groupId: GroupId;
  subjectId: SubjectId;
  subjectName: BilingualName;
  kind: GroupKind;
};

/**
 * A student's enrollment standing on a teacher's roster. `active` — at least one
 * live enrollment in one of the teacher's groups. `left` — no live enrollment left,
 * but a tombstoned one (SOU-299): the student the director hands the teacher still
 * appears, tagged with the month they departed.
 */
export type TeacherRosterStatus = 'active' | 'left';

/**
 * One line of a teacher's student roster (SOU-299) — distinct **student**, not
 * distinct enrollment: a student in two of the teacher's groups is a single row
 * whose `groups`/`subjects`/`kinds` aggregate those placements. Envelope-free — a
 * read-model row, not an entity.
 */
export type TeacherRosterEntry = {
  studentId: StudentId;
  name: BilingualName;
  /** The student's free-text grade label (`Student.level`), for display. */
  level: string;
  /** The teacher's groups this student sits in (or last sat in, when `left`). */
  groups: readonly TeacherRosterGroupRef[];
  /** Distinct subjects the student takes with this teacher, derived from `groups`. */
  subjects: readonly { subjectId: SubjectId; name: BilingualName }[];
  /** The distinct tracks (régulier / exam-prep) among `groups`. */
  kinds: readonly GroupKind[];
  /**
   * The student's subscribed pack, composed from their live subscriptions'
   * subjects — e.g. "Math + FR + AR" (CLAUDE.md §7). Empty when the student holds
   * no live subscription (common for a `left` student).
   */
  formulaLabel: string;
  status: TeacherRosterStatus;
  /** `YYYY-MM` the student left, when `status === 'left'`; null while active. */
  leftMonth: string | null;
};

/**
 * The roster of students a teacher teaches (SOU-299), for the "Élèves" tab on the
 * teacher detail screen. A teacher is not linked to students directly — the chain
 * is **teacher → group(s) → enrolled students** — so this read model traverses the
 * teacher's live groups, resolves each group's active and tombstoned enrollments,
 * and folds them to one row per distinct student. Gated by `core.teachers`.
 *
 * **Center-scoped** as defense in depth for the portable core: a teacher, group,
 * enrollment, or student whose `centerCode` differs from the caller's is dropped,
 * exactly as {@link GetGroupRoster} does. On desktop the one-DB-per-center boundary
 * makes this redundant; the same use case runs on the future shared-Postgres
 * backend where an id alone is not a tenant guard.
 *
 * A student who is both actively enrolled and separately tombstoned in the
 * teacher's groups resolves to `active` — a current placement always wins over a
 * past one, and only the active groups are shown. A student archived without first
 * being unenrolled is skipped (their record no longer resolves), so the roster
 * never shows a nameless seat — the same trailing-count caveat as the group roster.
 */
export class GetTeacherRoster {
  constructor(
    private readonly teachers: TeacherRepository,
    private readonly groups: GroupRepository,
    private readonly enrollments: EnrollmentRepository,
    private readonly students: StudentRepository,
    private readonly subjects: SubjectRepository,
    private readonly subscriptions: StudentSubscriptionRepository,
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
    if (teacherGroups.length === 0) return [];

    const subjectNames = await this.buildSubjectIndex(input.centerCode);
    const placements = await this.collectPlacements(teacherGroups, subjectNames);

    const entries = await Promise.all(
      [...placements.values()].map((placement) =>
        this.toEntry(placement, input.centerCode, subjectNames),
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
    teacherGroups: readonly Group[],
    subjectNames: ReadonlyMap<SubjectId, BilingualName>,
  ): Promise<Map<StudentId, StudentPlacement>> {
    const placements = new Map<StudentId, StudentPlacement>();

    for (const group of teacherGroups) {
      const ref: TeacherRosterGroupRef = {
        groupId: group.id,
        subjectId: group.subjectId,
        subjectName: subjectNames.get(group.subjectId) ?? { fr: '', ar: '' },
        kind: group.kind,
      };

      const active = await this.enrollments.listActiveByGroup(group.id);
      for (const enrollment of active) {
        addPlacement(placements, enrollment, ref, 'active', null);
      }

      const inactive = await this.enrollments.listInactiveByGroup(group.id);
      for (const enrollment of inactive) {
        addPlacement(placements, enrollment, ref, 'left', monthOf(enrollment.deletedAt));
      }
    }

    return placements;
  }

  private async toEntry(
    placement: StudentPlacement,
    centerCode: CenterCode,
    subjectNames: ReadonlyMap<SubjectId, BilingualName>,
  ): Promise<TeacherRosterEntry | null> {
    const student = await this.students.findById(placement.studentId);
    if (!student || student.centerCode !== centerCode) return null;

    const isActive = placement.activeGroups.size > 0;
    const groups = [...(isActive ? placement.activeGroups : placement.leftGroups).values()];

    return {
      studentId: student.id,
      name: { fr: student.name.fr, ar: student.name.ar },
      level: student.level,
      groups,
      subjects: distinctSubjects(groups),
      kinds: distinctKinds(groups),
      formulaLabel: await this.composeFormulaLabel(placement.studentId, centerCode, subjectNames),
      status: isActive ? 'active' : 'left',
      leftMonth: isActive ? null : placement.leftMonth,
    };
  }

  private async composeFormulaLabel(
    studentId: StudentId,
    centerCode: CenterCode,
    subjectNames: ReadonlyMap<SubjectId, BilingualName>,
  ): Promise<string> {
    const subscriptions = (await this.subscriptions.listLiveByStudent(studentId)).filter(
      (subscription) => subscription.centerCode === centerCode,
    );
    const names: string[] = [];
    for (const subscription of subscriptions) {
      for (const subjectId of subscription.subjectIds) {
        const name = subjectNames.get(subjectId)?.fr;
        if (name && !names.includes(name)) names.push(name);
      }
    }
    return names.join(' + ');
  }
}

type StudentPlacement = {
  studentId: StudentId;
  activeGroups: Map<GroupId, TeacherRosterGroupRef>;
  leftGroups: Map<GroupId, TeacherRosterGroupRef>;
  leftMonth: string | null;
};

function addPlacement(
  placements: Map<StudentId, StudentPlacement>,
  enrollment: Enrollment,
  ref: TeacherRosterGroupRef,
  status: TeacherRosterStatus,
  leftMonth: string | null,
): void {
  const placement = placements.get(enrollment.studentId) ?? {
    studentId: enrollment.studentId,
    activeGroups: new Map<GroupId, TeacherRosterGroupRef>(),
    leftGroups: new Map<GroupId, TeacherRosterGroupRef>(),
    leftMonth: null,
  };
  if (status === 'active') {
    placement.activeGroups.set(ref.groupId, ref);
  } else {
    placement.leftGroups.set(ref.groupId, ref);
    if (leftMonth && (placement.leftMonth === null || leftMonth > placement.leftMonth)) {
      placement.leftMonth = leftMonth;
    }
  }
  placements.set(enrollment.studentId, placement);
}

function distinctSubjects(
  groups: readonly TeacherRosterGroupRef[],
): readonly { subjectId: SubjectId; name: BilingualName }[] {
  const seen = new Map<SubjectId, BilingualName>();
  for (const group of groups) {
    if (!seen.has(group.subjectId)) seen.set(group.subjectId, group.subjectName);
  }
  return [...seen.entries()].map(([subjectId, name]) => ({ subjectId, name }));
}

function distinctKinds(groups: readonly TeacherRosterGroupRef[]): readonly GroupKind[] {
  const seen = new Set<GroupKind>();
  for (const group of groups) seen.add(group.kind);
  return [...seen];
}

function monthOf(at: Date | null): string | null {
  if (!at) return null;
  return at.toISOString().slice(0, 7);
}
