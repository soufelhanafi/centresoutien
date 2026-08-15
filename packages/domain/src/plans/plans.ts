/**
 * The single source of truth for plans and feature flags (CLAUDE.md §4).
 *
 * The app ships as one binary; plans are runtime configuration. This is the ONLY
 * file that names plans — everything else gates on `FeatureFlag`, never on a
 * plan id, so moving a feature between tiers is a one-line change here.
 */
export type PlanId = 'essentiel' | 'pro' | 'premium';

export const FEATURE_FLAGS = [
  // core (every plan)
  'core.rooms',
  'core.teachers',
  'core.students',
  'core.groups',
  'core.subjects',
  'core.formulas',
  'core.calendar.week',
  'core.invoicing',
  'core.parents',
  'core.attendance',
  'settings.center-hours',
  'settings.holidays',
  'dashboard.basic',
  // pro
  'core.invoicing.partial-paid',
  'core.invoice-template.customize',
  'core.exam-prep',
  'payroll.teacher',
  'payroll.teacher.fixed',
  'payroll.teacher.percentage',
  'io.excel.export',
  'io.excel.import',
  'io.excel.sync',
  'planning.custom-grid',
  'planning.teacher-availability',
  // premium
  'dashboard.advanced',
  'planning.random-auto',
  'sync.multi-device',
  'sync.cloud',
  'sync.conflict-resolution',
  'org.multi-center',
  'limits.students.unlimited',
  'limits.teachers.unlimited',
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];

export type PlanLimits = {
  maxStudents: number | 'unlimited';
  maxTeachers: number | 'unlimited';
  maxRooms: number | 'unlimited';
};

export type Plan = {
  id: PlanId;
  features: ReadonlySet<FeatureFlag>;
  limits: PlanLimits;
};

/**
 * MVP tier collapse (SOU-83): every feature ships in every tier except
 * `org.multi-center`, which requires the cloud hub and stays Premium-only.
 * `essentiel` and `pro` are deliberately identical for now — tiering is
 * configuration, so re-splitting later is an edit to these arrays alone.
 * Limits are `unlimited` on all three tiers.
 */
const sharedFeatures: readonly FeatureFlag[] = [
  'core.rooms',
  'core.teachers',
  'core.students',
  'core.groups',
  'core.subjects',
  'core.formulas',
  'core.calendar.week',
  'core.invoicing',
  'core.parents',
  'core.attendance',
  'settings.center-hours',
  'settings.holidays',
  'dashboard.basic',
  'core.invoicing.partial-paid',
  'core.invoice-template.customize',
  'core.exam-prep',
  'payroll.teacher',
  'payroll.teacher.fixed',
  'payroll.teacher.percentage',
  'io.excel.export',
  'io.excel.import',
  'io.excel.sync',
  'planning.custom-grid',
  'planning.teacher-availability',
  'dashboard.advanced',
  'planning.random-auto',
  'sync.multi-device',
  'sync.cloud',
  'sync.conflict-resolution',
  'limits.students.unlimited',
  'limits.teachers.unlimited',
];

const premiumFeatures: readonly FeatureFlag[] = [...sharedFeatures, 'org.multi-center'];

const unlimitedLimits = (): PlanLimits => ({
  maxStudents: 'unlimited',
  maxTeachers: 'unlimited',
  maxRooms: 'unlimited',
});

const essentiel: Plan = {
  id: 'essentiel',
  features: new Set(sharedFeatures),
  limits: unlimitedLimits(),
};

const pro: Plan = {
  id: 'pro',
  features: new Set(sharedFeatures),
  limits: unlimitedLimits(),
};

const premium: Plan = {
  id: 'premium',
  features: new Set(premiumFeatures),
  limits: unlimitedLimits(),
};

export const PLANS: Readonly<Record<PlanId, Plan>> = { essentiel, pro, premium };
