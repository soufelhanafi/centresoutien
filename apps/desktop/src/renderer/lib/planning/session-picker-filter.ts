import type { SessionGroupOption, SessionTeacherOption } from './session-options';

/**
 * Subject-aware filtering for the session form's teacher ↔ group pickers (SOU-277).
 *
 * The two pickers constrain each other by subject: a teacher may only lead a group
 * whose subject they teach, and a group may only be led by a teacher who teaches
 * its subject. These pure helpers hold that matching + invalid-selection logic so
 * it can be unit-tested without rendering the form.
 *
 * "Unassigned" is expressed as a `null` selection: a null teacher (or null group)
 * imposes no constraint, so the other list stays complete. A teacher with an empty
 * `subjectIds` ("unclassified") matches no subject-bearing group and is therefore
 * hidden once a group is selected — the same rule that filters any other teacher.
 */
function findTeacher(
  teachers: readonly SessionTeacherOption[],
  teacherId: string | null,
): SessionTeacherOption | null {
  if (teacherId === null) return null;
  return teachers.find((teacher) => teacher.id === teacherId) ?? null;
}

function findGroup(
  groups: readonly SessionGroupOption[],
  groupId: string | null,
): SessionGroupOption | null {
  if (groupId === null) return null;
  return groups.find((group) => group.id === groupId) ?? null;
}

/** Groups the selected teacher can lead — only those whose subject they teach. A
 *  null teacher imposes no constraint, so every group stays offered. */
export function visibleGroupsForTeacher(
  groups: readonly SessionGroupOption[],
  teachers: readonly SessionTeacherOption[],
  selectedTeacherId: string | null,
): readonly SessionGroupOption[] {
  const teacher = findTeacher(teachers, selectedTeacherId);
  if (teacher === null) return groups;
  return groups.filter((group) => teacher.subjectIds.includes(group.subjectId));
}

/** Teachers who can lead the selected group — only those who teach its subject. A
 *  null group imposes no constraint, so every teacher stays offered. */
export function visibleTeachersForGroup(
  teachers: readonly SessionTeacherOption[],
  groups: readonly SessionGroupOption[],
  selectedGroupId: string | null,
): readonly SessionTeacherOption[] {
  const group = findGroup(groups, selectedGroupId);
  if (group === null) return teachers;
  return teachers.filter((teacher) => teacher.subjectIds.includes(group.subjectId));
}

/** The load-time decision for a *persisted* teacher+group pair (SOU-277 AC3). */
export type PersistedPairReconciliation = { readonly clearTeacher: boolean };

/**
 * Reconciles a persisted teacher+group pair when the edit drawer mounts. A pair
 * can go stale after the fact (the teacher's `subjectIds` were edited away from the
 * group's subject), so silently keeping it — or silently blanking both sides — is
 * forbidden. The group's subject is the anchor; the teacher is the reassignable
 * side, so a genuine subject mismatch clears the teacher only and the caller raises
 * the "teacher removed" hint.
 *
 * Clearing is scoped to a *genuine subject mismatch*: the teacher must be present
 * in the loaded (active) list AND not teach the group's subject. A teacher absent
 * from the list (archived after the session was created, or unknown) is left
 * untouched — its absence is not evidence of a mismatch, and clearing it would
 * silently drop a valid historical assignment. A pair with either side unassigned,
 * or a compatible pair, is left untouched too.
 */
export function reconcilePersistedPair(
  teachers: readonly SessionTeacherOption[],
  groups: readonly SessionGroupOption[],
  selectedTeacherId: string | null,
  selectedGroupId: string | null,
): PersistedPairReconciliation {
  if (selectedTeacherId === null || selectedGroupId === null) {
    return { clearTeacher: false };
  }
  const teacher = findTeacher(teachers, selectedTeacherId);
  const group = findGroup(groups, selectedGroupId);
  if (teacher === null || group === null) {
    return { clearTeacher: false };
  }
  return { clearTeacher: !teacher.subjectIds.includes(group.subjectId) };
}
