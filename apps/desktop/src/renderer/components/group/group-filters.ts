import type { GroupKind, GroupRow } from '../../lib/groups/group-view';

/** Sentinel for the "all" option in the subject/kind selects (Radix needs a value). */
export const ALL = '__all__';

/**
 * Client-side list filters. `subjectId` / `kind` / `niveauId` are `ALL` or a
 * concrete value; `level` is a free-text contains-match (levels are free-form on
 * a group, so a dropdown of fixed levels would not fit). Applied in the panel —
 * `group.list` only scopes by active/archived.
 */
export type GroupFilters = {
  subjectId: string;
  level: string;
  kind: typeof ALL | GroupKind;
  niveauId: string;
};

/** The neutral filter state: everything shown. */
export const EMPTY_GROUP_FILTERS: GroupFilters = { subjectId: ALL, level: '', kind: ALL, niveauId: ALL };

/** True when any filter is narrowing the list (drives the "no results" vs "empty" copy). */
export function isFiltering(filters: GroupFilters): boolean {
  return (
    filters.subjectId !== ALL ||
    filters.kind !== ALL ||
    filters.level.trim() !== '' ||
    filters.niveauId !== ALL
  );
}

/** Applies the active filters to one lifecycle list. */
export function applyGroupFilters(
  groups: readonly GroupRow[],
  filters: GroupFilters,
): readonly GroupRow[] {
  const level = filters.level.trim().toLowerCase();
  return groups.filter(
    (group) =>
      (filters.subjectId === ALL || group.subjectId === filters.subjectId) &&
      (filters.kind === ALL || group.kind === filters.kind) &&
      (filters.niveauId === ALL || group.niveauId === filters.niveauId) &&
      (level === '' || group.level.toLowerCase().includes(level)),
  );
}
