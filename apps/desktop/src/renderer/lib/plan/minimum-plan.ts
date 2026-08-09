import type { FeatureFlag, PlanId } from '@centresoutien/domain';

/**
 * Contract-first stand-in for the domain's `FEATURE_TIER` + `minimumPlanFor`
 * (SOU-85 domain lane). The upgrade CTA must name the *intended* tier of a
 * flag ("Débloquer avec Pro"), which the flat MVP `PLANS` registry can't
 * express — every flag ships in every tier today except `org.multi-center`, so
 * the minimum plan isn't derivable from `PLANS`. Hence this explicit map.
 *
 * SWAP SEAM: when the domain adapter merges, replace the body of this file with
 * `export { FEATURE_TIER, minimumPlanFor } from '@centresoutien/domain';` — no
 * call site changes. The `Record<FeatureFlag, PlanId>` keeps this exhaustive:
 * adding a flag to the domain union breaks the build here until it's tiered.
 */
export const FEATURE_TIER: Readonly<Record<FeatureFlag, PlanId>> = {
  'core.rooms': 'essentiel',
  'core.teachers': 'essentiel',
  'core.students': 'essentiel',
  'core.groups': 'essentiel',
  'core.subjects': 'essentiel',
  'core.formulas': 'essentiel',
  'core.calendar.week': 'essentiel',
  'core.invoicing': 'essentiel',
  'core.parents': 'essentiel',
  'core.attendance': 'essentiel',
  'settings.center-hours': 'essentiel',
  'settings.holidays': 'essentiel',
  'dashboard.basic': 'essentiel',
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
  'dashboard.advanced': 'premium',
  'planning.random-auto': 'premium',
  'sync.multi-device': 'premium',
  'sync.cloud': 'premium',
  'sync.conflict-resolution': 'premium',
  'org.multi-center': 'premium',
  'limits.students.unlimited': 'premium',
  'limits.teachers.unlimited': 'premium',
};

/** The lowest plan whose tier includes `flag` — the plan the upgrade CTA names. */
export function minimumPlanFor(flag: FeatureFlag): PlanId {
  return FEATURE_TIER[flag];
}
