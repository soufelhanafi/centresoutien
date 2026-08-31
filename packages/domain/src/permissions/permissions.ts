/**
 * Per-user permission flags (CLAUDE.md-adjacent, SOU assistant-visibility): unlike
 * a {@link import('../plans/plans').FeatureFlag}, which gates a feature for the
 * whole center by plan, a `PermissionFlag` gates one hideable screen for ONE
 * employee, toggled by the owner per account. The single source of truth, same
 * shape as `FEATURE_FLAGS` — adding a new hideable screen later is an edit to
 * this array alone.
 *
 * Named after the nav module / settings tab each flag hides, so the mapping from
 * flag to UI surface stays 1:1 and self-explanatory.
 */
export const PERMISSION_FLAGS = ['nav.payments', 'nav.payroll', 'settings.sensitive'] as const;

export type PermissionFlag = (typeof PERMISSION_FLAGS)[number];

/**
 * Every permission granted — the default for a newly created employee (opt-out,
 * not opt-in): nothing is hidden until the owner explicitly unchecks something.
 */
export const ALL_PERMISSION_FLAGS: ReadonlySet<PermissionFlag> = new Set(PERMISSION_FLAGS);
