import type { TeacherRosterEntryView, TeacherRosterFilter } from './teacher-roster-view';

/**
 * One selectable option in the subject/group filters. `label` is localized for the
 * active UI language; `labelFr` is always the French label — the FR-only roster PDF
 * (SOU-279 convention) needs a French filter summary regardless of the UI locale.
 */
export type TeacherRosterFacet = { id: string; label: string; labelFr: string };

/** The bilingual name in the active language, falling back to the other script so a
 *  record that carries only one never renders blank. */
export function pickLocalizedName(name: { fr: string; ar: string }, language: string): string {
  const preferred = language.startsWith('ar') ? name.ar : name.fr;
  return preferred || name.fr || name.ar;
}

function groupLabel(subjectName: string, level: string): string {
  return level ? `${subjectName} — ${level}` : subjectName;
}

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

/** The distinct subjects across the roster — the subject filter options, labelled in
 *  the active language (with an always-FR label for the PDF), sorted by display
 *  label. The subject filter is only shown when this yields more than one. */
export function teacherRosterSubjectFacets(
  roster: readonly TeacherRosterEntryView[],
  language: string,
): readonly TeacherRosterFacet[] {
  const byId = new Map<string, TeacherRosterFacet>();
  for (const entry of roster) {
    for (const subject of entry.subjects) {
      if (byId.has(subject.subjectId)) continue;
      byId.set(subject.subjectId, {
        id: subject.subjectId,
        label: pickLocalizedName(subject.name, language),
        labelFr: subject.name.fr || subject.name.ar,
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label, language));
}

/** The distinct groups across the roster, labelled "subject — level" (a group has no
 *  name of its own), in the active language (with an always-FR label for the PDF),
 *  sorted by display label — the group filter options. */
export function teacherRosterGroupFacets(
  roster: readonly TeacherRosterEntryView[],
  language: string,
): readonly TeacherRosterFacet[] {
  const byId = new Map<string, TeacherRosterFacet>();
  for (const entry of roster) {
    for (const group of entry.groups) {
      if (byId.has(group.groupId)) continue;
      byId.set(group.groupId, {
        id: group.groupId,
        label: groupLabel(pickLocalizedName(group.subjectName, language), group.level),
        labelFr: groupLabel(group.subjectName.fr || group.subjectName.ar, group.level),
      });
    }
  }
  return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label, language));
}
