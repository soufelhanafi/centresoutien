import type { TeacherRosterEntryView, TeacherRosterFilter } from './teacher-roster-view';

/** One selectable option in the subject/group filters, labelled for display. */
export type TeacherRosterFacet = { id: string; label: string };

function matchesName(entry: TeacherRosterEntryView, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return entry.name.fr.toLowerCase().includes(needle) || entry.name.ar.includes(query.trim());
}

/**
 * Applies the roster filter (AND across subject / group / name / status) to the
 * full roster. Distinct students already; a student stays if any of their groups
 * matches the subject/group facet, so a multi-group student is not dropped by a
 * facet that matches only one of their groups.
 */
export function filterTeacherRoster(
  roster: readonly TeacherRosterEntryView[],
  filter: TeacherRosterFilter,
): readonly TeacherRosterEntryView[] {
  return roster.filter((entry) => {
    if (filter.status !== 'all' && entry.status !== filter.status) return false;
    if (filter.subjectId && !entry.subjects.some((subject) => subject.subjectId === filter.subjectId)) {
      return false;
    }
    if (filter.groupId && !entry.groups.some((group) => group.groupId === filter.groupId)) return false;
    if (!matchesName(entry, filter.nameQuery)) return false;
    return true;
  });
}

/** The distinct subjects across the roster, sorted by FR name — the subject filter
 *  options. The subject filter is only shown when this yields more than one. */
export function teacherRosterSubjectFacets(
  roster: readonly TeacherRosterEntryView[],
): readonly TeacherRosterFacet[] {
  const byId = new Map<string, string>();
  for (const entry of roster) {
    for (const subject of entry.subjects) {
      if (!byId.has(subject.subjectId)) byId.set(subject.subjectId, subject.name.fr);
    }
  }
  return [...byId.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** The distinct groups across the roster, labelled "subject — level" (a group has
 *  no name of its own), sorted by label — the group filter options. */
export function teacherRosterGroupFacets(
  roster: readonly TeacherRosterEntryView[],
): readonly TeacherRosterFacet[] {
  const byId = new Map<string, string>();
  for (const entry of roster) {
    for (const group of entry.groups) {
      if (byId.has(group.groupId)) continue;
      const label = group.level ? `${group.subjectName.fr} — ${group.level}` : group.subjectName.fr;
      byId.set(group.groupId, label);
    }
  }
  return [...byId.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
