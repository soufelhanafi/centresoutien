import type { PlannerSessionView, SessionKind } from './planner-view';

/** Sentinel for the "all" option in every planner filter (Radix Select forbids `''`). */
export const ALL = '__all__';

/** The kind filter's tri-state: both tracks, or one of them. */
export type KindFilter = 'all' | SessionKind;

/** The planner's active filter selection. `''`/`'all'` mean "no restriction". */
export type PlannerFilters = {
  readonly teacherId: string;
  readonly roomId: string;
  readonly level: string;
  readonly kind: KindFilter;
};

/** The empty selection — everything visible. */
export const NO_FILTERS: PlannerFilters = {
  teacherId: '',
  roomId: '',
  level: '',
  kind: 'all',
};

/** True when no filter is narrowing the week. */
export function hasActiveFilters(filters: PlannerFilters): boolean {
  return (
    filters.teacherId !== '' ||
    filters.roomId !== '' ||
    filters.level !== '' ||
    filters.kind !== 'all'
  );
}

/** One selectable option: a stable id/value plus its display label. */
export type FilterOption = { readonly value: string; readonly label: string };

/** The distinct teacher / room / level options present in the week, sorted for display. */
export type FilterOptions = {
  readonly teachers: readonly FilterOption[];
  readonly rooms: readonly FilterOption[];
  readonly levels: readonly string[];
};

/**
 * Derives the filter dropdown options from the week's own sessions — a filter
 * only ever offers values that exist, so it can never select an empty result by
 * construction. Unassigned-teacher sessions contribute no teacher option; they
 * simply fall outside any specific-teacher filter.
 */
export function deriveFilterOptions(sessions: readonly PlannerSessionView[]): FilterOptions {
  const teachers = new Map<string, string>();
  const rooms = new Map<string, string>();
  const levels = new Set<string>();

  for (const s of sessions) {
    if (s.teacherId !== null && s.teacherName !== null) teachers.set(s.teacherId, s.teacherName);
    rooms.set(s.roomId, s.roomName);
    levels.add(s.level);
  }

  const byLabel = (a: FilterOption, b: FilterOption) => a.label.localeCompare(b.label);
  return {
    teachers: [...teachers].map(([value, label]) => ({ value, label })).sort(byLabel),
    rooms: [...rooms].map(([value, label]) => ({ value, label })).sort(byLabel),
    levels: [...levels].sort((a, b) => a.localeCompare(b)),
  };
}

/** Keeps only the sessions matching every active filter. */
export function applyFilters(
  sessions: readonly PlannerSessionView[],
  filters: PlannerFilters,
): readonly PlannerSessionView[] {
  return sessions.filter(
    (s) =>
      (filters.teacherId === '' || s.teacherId === filters.teacherId) &&
      (filters.roomId === '' || s.roomId === filters.roomId) &&
      (filters.level === '' || s.level === filters.level) &&
      (filters.kind === 'all' || s.kind === filters.kind),
  );
}
