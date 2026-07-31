/**
 * First-run wizard step identifiers and ordering (SOU-25).
 *
 * The wizard sequences a center's initial setup. Language, Center Profile, Admin
 * Account, and Hours are mandatory and non-skippable; Holidays is optional and
 * present when the plan grants `settings.holidays` — every plan since SOU-30 moved
 * that feature to Essentiel (the gating stays feature-flag-driven, not plan-named,
 * so it still omits the step for any plan that lacks the flag). Persistence for
 * each step lives in its own ticket (SOU-28 profile, SOU-29 hours, SOU-30
 * holidays) — this module owns ordering only, never the per-step data shapes.
 */

export type WizardStepId =
  | 'language'
  | 'center-profile'
  | 'admin-account'
  | 'hours'
  | 'holidays';

/** Steps every run must pass through, in order. Cannot be skipped. */
export const MANDATORY_STEP_IDS = [
  'language',
  'center-profile',
  'admin-account',
  'hours',
] as const satisfies readonly WizardStepId[];

/** Optional steps, appended to the sequence when their plan feature is granted. */
export const OPTIONAL_STEP_IDS = ['holidays'] as const satisfies readonly WizardStepId[];

const MANDATORY = new Set<WizardStepId>(MANDATORY_STEP_IDS);

/** True when a step must be committed (not merely skipped) to move past it. */
export function isMandatoryStep(step: WizardStepId): boolean {
  return MANDATORY.has(step);
}
