import type { GroupKind, GroupRow } from '../groups/group-view';
import { localizedName } from '../groups/localized-name';

/** The kind filter shown in the teacher "Groupes" tab (SOU-317). */
export type TeacherGroupsKindFilter = 'all' | GroupKind;

/** The composable filter over a teacher's groups (AND semantics). */
export type TeacherGroupsFilter = {
  nameQuery: string;
  kind: TeacherGroupsKindFilter;
};

export const EMPTY_TEACHER_GROUPS_FILTER: TeacherGroupsFilter = {
  nameQuery: '',
  kind: 'all',
};

/**
 * The active groups a teacher currently leads (SOU-317) — every active group whose
 * `teacherId` is this teacher, sorted by localized subject then level. A teacher is
 * not stored against its groups directly; the relation is the group's `teacherId`
 * (SOU-48), so this is a pure client-side selection over the already-loaded active
 * group list — no new read model. Past (since-reassigned) groups are out of scope
 * for v1: the group list carries only the current teacher-of-record (SOU-301).
 */
export function selectTeacherGroups(
  groups: readonly GroupRow[],
  teacherId: string,
  language: string,
): readonly GroupRow[] {
  return groups
    .filter((group) => group.teacherId === teacherId)
    .slice()
    .sort((a, b) => {
      const bySubject = localizedName(a.subjectName, language).localeCompare(
        localizedName(b.subjectName, language),
        language,
      );
      return bySubject !== 0 ? bySubject : a.level.localeCompare(b.level, language);
    });
}

function matchesQuery(group: GroupRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return (
    group.subjectName.fr.toLowerCase().includes(needle) ||
    group.subjectName.ar.includes(query.trim()) ||
    group.level.toLowerCase().includes(needle)
  );
}

/**
 * Applies the tab filter (AND across kind / name) to the teacher's groups. Name
 * search matches the group's identity — its subject (either script) or level —
 * since a group has no name of its own.
 */
export function filterTeacherGroups(
  groups: readonly GroupRow[],
  filter: TeacherGroupsFilter,
): readonly GroupRow[] {
  return groups.filter((group) => {
    if (filter.kind !== 'all' && group.kind !== filter.kind) return false;
    if (!matchesQuery(group, filter.nameQuery)) return false;
    return true;
  });
}

/** The distinct kinds present among the teacher's groups. The kind filter is only
 *  shown when this yields more than one — a single-track teacher needs no filter. */
export function teacherGroupsKinds(groups: readonly GroupRow[]): readonly GroupKind[] {
  const seen = new Set<GroupKind>();
  for (const group of groups) seen.add(group.kind);
  return [...seen];
}
