import type {
  MultiCenterStatsRow,
  MultiCenterStatsTotals,
  MultiCenterStatsView,
} from '@centresoutien/domain';

/**
 * The renderer's per-center stats view types (SOU-106). These are the domain's
 * own read-model shapes, imported unchanged — the IPC DTO on the boundary is
 * structurally identical, so the gateway hands the renderer the domain type with
 * no local copy (CLAUDE.md §13: never duplicate a domain shape in the renderer).
 */
export type MultiCenterStatsRowView = MultiCenterStatsRow;
export type MultiCenterStatsTotalsView = MultiCenterStatsTotals;
export type MultiCenterStatsViewModel = MultiCenterStatsView;
