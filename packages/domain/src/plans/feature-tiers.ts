import type { FeatureFlag, PlanId } from './plans';

/**
 * The plan tier each feature is INTENDED to belong to — the single source for
 * upgrade-CTA wording ("Débloquer avec Pro" / "أُفتح مع بريميوم", SOU-85). This is
 * NOT the live gating decision: gating stays `PLANS` + `PlanPolicy`. Under the
 * SOU-83 MVP tier collapse every flag except `org.multi-center` ships in every
 * tier, so the intended tier is not derivable from `PLANS` — it is declared
 * explicitly here. Re-splitting tiers later edits this map alongside `plans.ts`.
 *
 * The groupings mirror the `// core` / `// pro` / `// premium` comments in
 * `plans.ts`. The `Record<FeatureFlag, PlanId>` type makes the map exhaustive:
 * adding a new flag without a tier here is a compile error.
 *
 * Invariant (asserted in tests): the tier named for a flag must be a plan that
 * actually grants the flag — `PLANS[FEATURE_TIER[flag]].features.has(flag)`.
 */
export const FEATURE_TIER: Readonly<Record<FeatureFlag, PlanId>> = {
  // core → essentiel
  'core.rooms': 'essentiel',
  'core.teachers': 'essentiel',
  'core.students': 'essentiel',
  'core.groups': 'essentiel',
  'core.subjects': 'essentiel',
  'core.niveaux': 'essentiel',
  'core.formulas': 'essentiel',
  'core.calendar.week': 'essentiel',
  'core.invoicing': 'essentiel',
  'core.parents': 'essentiel',
  'core.attendance': 'essentiel',
  'settings.center-hours': 'essentiel',
  'settings.holidays': 'essentiel',
  'dashboard.basic': 'essentiel',
  // pro
  'core.invoicing.partial-paid': 'pro',
  'core.invoice-template.customize': 'pro',
  'core.exam-prep': 'pro',
  'payroll.teacher': 'pro',
  'payroll.teacher.fixed': 'pro',
  'payroll.teacher.percentage': 'pro',
  'io.excel.export': 'pro',
  'io.excel.import': 'pro',
  'io.excel.sync': 'pro',
  'planning.custom-grid': 'pro',
  'planning.teacher-availability': 'pro',
  // premium
  'dashboard.advanced': 'premium',
  'planning.random-auto': 'premium',
  'sync.multi-device': 'premium',
  'sync.cloud': 'premium',
  'sync.conflict-resolution': 'premium',
  'org.multi-center': 'premium',
  'limits.students.unlimited': 'premium',
  'limits.teachers.unlimited': 'premium',
};

/**
 * The minimum plan a center must hold to unlock `flag` — the tier an upgrade CTA
 * points the user toward. Wording only; enforcement remains `PlanPolicy.require`.
 */
export function minimumPlanFor(flag: FeatureFlag): PlanId {
  return FEATURE_TIER[flag];
}
