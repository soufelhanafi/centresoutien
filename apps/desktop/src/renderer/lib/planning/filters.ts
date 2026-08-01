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

/** The distinct teacher / room / level options offered by the planner, sorted for display. */
export type FilterOptions = {
  readonly teachers: readonly FilterOption[];
  readonly rooms: readonly FilterOption[];
  readonly levels: readonly string[];
};

/** Room and level options derived from the week's sessions (teachers come from the live roster). */
export type RoomLevelOptions = {
  readonly rooms: readonly FilterOption[];
  readonly levels: readonly string[];
};

/** Alphabetical by display label, locale-aware. */
export function byLabel(a: FilterOption, b: FilterOption): number {
  return a.label.localeCompare(b.label);
}

/**
 * Derives the room and level filter options from the week's own sessions — a
 * filter only ever offers values that exist, so it can never select an empty
 * result by construction. A session in an archived/not-yet-synced room (`roomName
 * === null`) is still filterable, shown under `unknownRoomLabel`; a session with
 * no level (`level === null`, no live group) contributes no level option.
 *
 * Teachers are intentionally **not** derived here: the teacher filter reads the
 * live *active* roster (SOU-118 / SOU-37) so an archived teacher drops from the
 * picker even while their past sessions still render.
 */
export function deriveRoomLevelOptions(
  sessions: readonly PlannerSessionView[],
  unknownRoomLabel: string,
): RoomLevelOptions {
  const rooms = new Map<string, string>();
  const levels = new Set<string>();

  for (const s of sessions) {
    rooms.set(s.roomId, s.roomName ?? unknownRoomLabel);
    if (s.level !== null) levels.add(s.level);
  }

  return {
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
