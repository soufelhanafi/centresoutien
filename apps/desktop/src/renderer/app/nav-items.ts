import {
  LayoutDashboard,
  GraduationCap,
  Users,
  UserRound,
  BookOpen,
  Layers,
  School,
  Boxes,
  DoorOpen,
  CalendarDays,
  ReceiptText,
  Wallet,
  HandCoins,
  BarChart3,
  RefreshCw,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { FeatureFlag } from '@centresoutien/domain';
import type { PlanTier } from '@centresoutien/ui';

/**
 * The single source of truth for the app shell's navigation. Both the sidebar
 * and the router build from these modules, so a module is declared in exactly
 * one place.
 *
 * `feature` gates an entry through `useFeature` (never a plan-name check — see
 * plan-feature-gate). `requiredTier` is display-only: it labels the upgrade
 * badge on a locked entry and never drives the gating decision.
 *
 * `hideWhenLocked` removes the entry from the nav entirely when its feature is
 * missing, instead of the default locked (disabled + upgrade-badge) affordance.
 * Reserved for features that carry no meaning on a lower plan — a single-center
 * Pro user has no "per-center stats" (SOU-309), so that entry must not appear as
 * a dead lock.
 *
 * Each module is a named `as const` value so its `path` stays a string literal —
 * that keeps the router's route tree and every `<Link to>` fully type-checked.
 */
export type NavModule = {
  /** Stable id; also the i18n label key under `nav.<id>`. */
  readonly id: string;
  readonly path: string;
  readonly icon: LucideIcon;
  readonly feature?: FeatureFlag;
  readonly requiredTier?: PlanTier;
  readonly hideWhenLocked?: boolean;
};

export const dashboardModule = { id: 'dashboard', path: '/dashboard', icon: LayoutDashboard } as const satisfies NavModule;
export const studentsModule = { id: 'students', path: '/students', icon: GraduationCap } as const satisfies NavModule;
export const teachersModule = { id: 'teachers', path: '/teachers', icon: Users } as const satisfies NavModule;
export const parentsModule = { id: 'parents', path: '/parents', icon: UserRound } as const satisfies NavModule;
export const subjectsModule = { id: 'subjects', path: '/subjects', icon: BookOpen } as const satisfies NavModule;
export const formulasModule = { id: 'formulas', path: '/formulas', icon: Layers } as const satisfies NavModule;
export const niveauxModule = { id: 'niveaux', path: '/niveaux', icon: School } as const satisfies NavModule;
export const groupsModule = { id: 'groups', path: '/groups', icon: Boxes } as const satisfies NavModule;
export const roomsModule = { id: 'rooms', path: '/rooms', icon: DoorOpen } as const satisfies NavModule;
export const planningModule = { id: 'planning', path: '/planning', icon: CalendarDays } as const satisfies NavModule;
export const invoicingModule = { id: 'invoicing', path: '/invoicing', icon: ReceiptText } as const satisfies NavModule;
export const paymentsModule = { id: 'payments', path: '/payments', icon: Wallet } as const satisfies NavModule;
export const payrollModule = { id: 'payroll', path: '/payroll', icon: HandCoins, feature: 'payroll.teacher', requiredTier: 'pro' } as const satisfies NavModule;
export const multiCenterStatsModule = {
  id: 'multiCenterStats',
  path: '/multi-center-stats',
  icon: BarChart3,
  feature: 'org.multi-center',
  requiredTier: 'premium',
  hideWhenLocked: true,
} as const satisfies NavModule;
export const syncModule = { id: 'sync', path: '/sync', icon: RefreshCw, feature: 'sync.multi-device' } as const satisfies NavModule;
export const settingsModule = { id: 'settings', path: '/settings', icon: Settings } as const satisfies NavModule;

/** Sidebar order. Typed as `NavModule` so iteration reads optional fields uniformly. */
export const NAV_MODULES: readonly NavModule[] = [
  dashboardModule,
  studentsModule,
  teachersModule,
  parentsModule,
  subjectsModule,
  formulasModule,
  niveauxModule,
  groupsModule,
  roomsModule,
  planningModule,
  invoicingModule,
  paymentsModule,
  payrollModule,
  multiCenterStatsModule,
  syncModule,
  settingsModule,
];

/** Where the app lands after login. */
export const DEFAULT_ROUTE = dashboardModule.path;
