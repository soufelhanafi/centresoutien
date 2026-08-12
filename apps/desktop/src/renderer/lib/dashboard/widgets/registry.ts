import type { FeatureFlag } from '@centresoutien/domain';

/** The Basique dashboard's configurable widgets (every plan). */
export type BasicWidgetId = 'argent' | 'effectifs' | 'teacher-load' | 'seances' | 'quick-actions';

/** The Avancé dashboard's configurable widgets (gated by `dashboard.advanced`). */
export type AdvancedWidgetId =
  | 'revenue-trend'
  | 'enrollment-evolution'
  | 'attendance-rate'
  | 'subject-breakdown'
  | 'enrollment-activity'
  | 'attendance-heatmap';

export type DashboardWidgetId = BasicWidgetId | AdvancedWidgetId;

export type DashboardWidgetPanel = 'basic' | 'advanced';

export type DashboardWidgetDefinition = {
  readonly id: DashboardWidgetId;
  readonly panel: DashboardWidgetPanel;
  /** i18n key for the widget's display name (checklist row, lock overlay, section header). */
  readonly labelKey: string;
  /**
   * Plan flag that gates the widget. `undefined` = every plan. Gating is only
   * ever read via `useFeature` (plan-feature-gate) — a widget whose flag is
   * unavailable renders its locked/upgrade state, never the real content.
   */
  readonly feature?: FeatureFlag;
  /** Grid footprint in its panel: `full` spans the whole row, `single` fills one cell. */
  readonly span: 'full' | 'single';
};

/**
 * The single source of truth for the dashboard's configurable widgets (SOU-231).
 * Order here is the fresh-install default order — it must match the mockup order
 * the panels rendered before the config existed (Argent, then the three-column
 * row, then quick actions on Basique; the six cards in mockup order on Avancé).
 */
export const DASHBOARD_WIDGETS: readonly DashboardWidgetDefinition[] = [
  // Basique — every plan, never gated.
  { id: 'argent', panel: 'basic', labelKey: 'dashboard.widgets.names.argent', span: 'full' },
  { id: 'effectifs', panel: 'basic', labelKey: 'dashboard.basic.sections.effectifs', span: 'single' },
  { id: 'teacher-load', panel: 'basic', labelKey: 'dashboard.basic.sections.teacherLoad', span: 'single' },
  { id: 'seances', panel: 'basic', labelKey: 'dashboard.basic.sections.seances', span: 'single' },
  { id: 'quick-actions', panel: 'basic', labelKey: 'dashboard.basic.quickActions.title', span: 'full' },
  // Avancé — all gated by `dashboard.advanced`.
  { id: 'revenue-trend', panel: 'advanced', labelKey: 'dashboard.advanced.widgets.revenueTrend', feature: 'dashboard.advanced', span: 'single' },
  { id: 'enrollment-evolution', panel: 'advanced', labelKey: 'dashboard.advanced.widgets.enrollmentEvolution', feature: 'dashboard.advanced', span: 'single' },
  { id: 'attendance-rate', panel: 'advanced', labelKey: 'dashboard.advanced.widgets.attendanceRate', feature: 'dashboard.advanced', span: 'single' },
  { id: 'subject-breakdown', panel: 'advanced', labelKey: 'dashboard.advanced.widgets.subjectBreakdown', feature: 'dashboard.advanced', span: 'single' },
  { id: 'enrollment-activity', panel: 'advanced', labelKey: 'dashboard.advanced.widgets.enrollmentActivity.title', feature: 'dashboard.advanced', span: 'single' },
  { id: 'attendance-heatmap', panel: 'advanced', labelKey: 'dashboard.advanced.widgets.attendanceHeatmap.title', feature: 'dashboard.advanced', span: 'full' },
];

/** O(1) lookup used by the preference resolver and the panels. */
export const DASHBOARD_WIDGETS_BY_ID: ReadonlyMap<DashboardWidgetId, DashboardWidgetDefinition> = new Map(
  DASHBOARD_WIDGETS.map((definition) => [definition.id, definition]),
);
