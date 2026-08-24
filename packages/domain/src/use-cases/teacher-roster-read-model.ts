import type { GroupId, GroupKind, Group } from '../entities/group';
import type { SubjectId } from '../entities/subject';
import type { StudentId, Student } from '../entities/student';
import type { StudentSubscription } from '../entities/student-subscription';
import type { Enrollment } from '../entities/enrollment';

/*
 * Read-model types and pure helpers for GetTeacherRoster (SOU-299 / SOU-301),
 * split out of the use case so the orchestration class stays within the size
 * ceiling. Nothing here touches ports or the clock — it is all shape + folding.
 */

export type BilingualName = { fr: string; ar: string };

/*
 * One of the teacher's groups the student sits in, named for display/filtering.
 * `level` is the group's free-text grade label — it disambiguates two groups of
 * the same subject in the group filter, where a group (which has no name of its
 * own) is shown as "subject — level".
 */
export type TeacherRosterGroupRef = {
  groupId: GroupId;
  subjectId: SubjectId;
  subjectName: BilingualName;
  level: string;
  kind: GroupKind;
};

/*
 * A student's enrollment standing on a teacher's roster. `active` — at least one
 * live enrollment in one of the teacher's groups. `left` — no live enrollment
 * left, but a tombstone attributed to this teacher (the departure month is shown).
 */
export type TeacherRosterStatus = 'active' | 'left';

/*
 * One line of a teacher's student roster (SOU-299) — distinct student, not
 * distinct enrollment: a student in two of the teacher's groups is a single row
 * whose groups/subjects/kinds aggregate those placements. Envelope-free — a
 * read-model row, not an entity. `formulaLabel` is the student's subscribed pack
 * composed from their live subscriptions' subjects (CLAUDE.md §7), bilingual so
 * the screen renders in the active language while the FR-only PDF uses `.fr`;
 * both scripts are empty when the student holds no live subscription (common for
 * a `left` student). `leftMonth` is the `YYYY-MM` of departure when `left`, else null.
 */
export type TeacherRosterEntry = {
  studentId: StudentId;
  name: BilingualName;
  level: string;
  groups: readonly TeacherRosterGroupRef[];
  subjects: readonly { subjectId: SubjectId; name: BilingualName }[];
  kinds: readonly GroupKind[];
  formulaLabel: BilingualName;
  status: TeacherRosterStatus;
  leftMonth: string | null;
};

/* Per-student accumulator while folding placements: active wins over left. */
export type StudentPlacement = {
  studentId: StudentId;
  activeGroups: Map<GroupId, TeacherRosterGroupRef>;
  leftGroups: Map<GroupId, TeacherRosterGroupRef>;
  leftMonth: string | null;
};

export function buildGroupRef(
  group: Group,
  subjectNames: ReadonlyMap<SubjectId, BilingualName>,
): TeacherRosterGroupRef {
  return {
    groupId: group.id,
    subjectId: group.subjectId,
    subjectName: subjectNames.get(group.subjectId) ?? { fr: '', ar: '' },
    level: group.level,
    kind: group.kind,
  };
}

export function addPlacement(
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

export function buildRosterEntry(
  student: Student,
  placement: StudentPlacement,
  formulaLabel: BilingualName,
): TeacherRosterEntry {
  const isActive = placement.activeGroups.size > 0;
  const groups = [...(isActive ? placement.activeGroups : placement.leftGroups).values()];
  return {
    studentId: student.id,
    name: { fr: student.name.fr, ar: student.name.ar },
    level: student.level,
    groups,
    subjects: distinctSubjects(groups),
    kinds: distinctKinds(groups),
    formulaLabel,
    status: isActive ? 'active' : 'left',
    leftMonth: isActive ? null : placement.leftMonth,
  };
}

/*
 * The subscribed pack composed from the subscriptions already filtered to the
 * ones live this month — deduped across subscriptions, joined as "Math + FR".
 */
export function composeFormulaLabel(
  subscriptions: readonly StudentSubscription[],
  subjectNames: ReadonlyMap<SubjectId, BilingualName>,
): BilingualName {
  const seen = new Set<SubjectId>();
  const parts: BilingualName[] = [];
  for (const subscription of subscriptions) {
    for (const subjectId of subscription.subjectIds) {
      if (seen.has(subjectId)) continue;
      seen.add(subjectId);
      const name = subjectNames.get(subjectId);
      if (name) parts.push(name);
    }
  }
  return {
    fr: parts.map((part) => part.fr).join(' + '),
    ar: parts.map((part) => part.ar).join(' + '),
  };
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

export function monthOf(at: Date | null): string | null {
  if (!at) return null;
  return at.toISOString().slice(0, 7);
}
