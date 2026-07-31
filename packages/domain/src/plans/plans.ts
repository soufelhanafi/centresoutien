/**
 * The single source of truth for plans and feature flags (CLAUDE.md §4).
 *
 * The app ships as one binary; plans are runtime configuration. This is the ONLY
 * file that names plans — everything else gates on `FeatureFlag`, never on a
 * plan id, so moving a feature between tiers is a one-line change here.
 */
export type PlanId = 'essentiel' | 'pro' | 'premium';

export type FeatureFlag =
  // core (every plan)
  | 'core.rooms'
  | 'core.teachers'
  | 'core.students'
  | 'core.groups'
  | 'core.subjects'
  | 'core.formulas'
  | 'core.calendar.week'
  | 'core.invoicing'
  | 'core.parents'
  | 'settings.center-hours'
  | 'settings.holidays'
  | 'dashboard.basic'
  // pro
  | 'core.invoicing.partial-paid'
  | 'core.invoice-template.customize'
  | 'core.exam-prep'
  | 'payroll.teacher'
  | 'payroll.teacher.fixed'
  | 'payroll.teacher.percentage'
  | 'io.excel.export'
  | 'io.excel.import'
  | 'io.excel.sync'
  | 'planning.custom-grid'
  // premium
  | 'dashboard.advanced'
  | 'planning.random-auto'
  | 'sync.multi-device'
  | 'sync.cloud'
  | 'sync.conflict-resolution'
  | 'org.multi-center'
  | 'limits.students.unlimited'
  | 'limits.teachers.unlimited';

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

const essentielFeatures: readonly FeatureFlag[] = [
  'core.rooms',
  'core.teachers',
  'core.students',
  'core.groups',
  'core.subjects',
  'core.formulas',
  'core.calendar.week',
  'core.invoicing',
  'core.parents',
  'settings.center-hours',
  'settings.holidays',
  'dashboard.basic',
];

const proFeatures: readonly FeatureFlag[] = [
  ...essentielFeatures,
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
];

const premiumFeatures: readonly FeatureFlag[] = [
  ...proFeatures,
  'dashboard.advanced',
  'planning.random-auto',
  'sync.multi-device',
  'sync.cloud',
  'sync.conflict-resolution',
  'org.multi-center',
  'limits.students.unlimited',
  'limits.teachers.unlimited',
];

const essentiel: Plan = {
  id: 'essentiel',
  features: new Set(essentielFeatures),
  limits: { maxStudents: 50, maxTeachers: 2, maxRooms: 1 },
};

const pro: Plan = {
  id: 'pro',
  features: new Set(proFeatures),
  limits: { maxStudents: 300, maxTeachers: 10, maxRooms: 5 },
};

const premium: Plan = {
  id: 'premium',
  features: new Set(premiumFeatures),
  limits: { maxStudents: 'unlimited', maxTeachers: 'unlimited', maxRooms: 'unlimited' },
};

export const PLANS: Readonly<Record<PlanId, Plan>> = { essentiel, pro, premium };
