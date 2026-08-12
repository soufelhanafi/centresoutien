/**
 * First-run wizard step identifiers and ordering (SOU-25, trimmed in SOU-235).
 *
 * The wizard sequences a center's initial setup: Language, Center Profile, and
 * Admin Account — all mandatory and non-skippable. Opening hours and holidays
 * used to be wizard steps, but persisting them there is blocked by restricted
 * mode on an unlicensed first run (their IPC channels aren't allow-listed), so
 * default hours are now seeded domain-side at center creation and the admin
 * configures hours/holidays later in Settings. This module owns ordering only,
 * never the per-step data shapes (SOU-28 owns profile persistence).
 */

export type WizardStepId = 'language' | 'center-profile' | 'admin-account';

/** Steps every run must pass through, in order. Cannot be skipped. */
export const MANDATORY_STEP_IDS = [
  'language',
  'center-profile',
  'admin-account',
] as const satisfies readonly WizardStepId[];

/**
 * Optional steps, appended to the sequence when their plan feature is granted.
 * Empty since SOU-235 dropped the plan-gated Holidays step; kept as the seam for
 * any future optional step so the machine's skip path stays defined.
 */
export const OPTIONAL_STEP_IDS = [] as const satisfies readonly WizardStepId[];

const MANDATORY = new Set<WizardStepId>(MANDATORY_STEP_IDS);

/** True when a step must be committed (not merely skipped) to move past it. */
export function isMandatoryStep(step: WizardStepId): boolean {
  return MANDATORY.has(step);
}
