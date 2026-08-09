/**
 * Upgrade-CTA plan wording (SOU-85). The intended tier of each flag lives in the
 * domain as the single source of truth — the flat MVP `PLANS` registry can't
 * express it (every flag ships in every tier today except `org.multi-center`).
 * Re-exported here so renderer call sites keep a stable local import path.
 */
export { FEATURE_TIER, minimumPlanFor } from '@centresoutien/domain';
