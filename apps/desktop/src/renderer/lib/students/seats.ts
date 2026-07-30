import type { PlanLimits } from '@centresoutien/domain';

/** Remaining-capacity view for the plan's `maxStudents` limit. */
export type Seats =
  | { readonly kind: 'unlimited' }
  | { readonly kind: 'limited'; readonly max: number; readonly remaining: number; readonly full: boolean };

/**
 * Pure projection of the plan limit against the current headcount. The hard gate
 * lives in the domain (`CreateStudent` → `requireBelowLimit`); this only drives
 * the UI nudge (plan-feature-gate §8).
 */
export function computeSeats(max: PlanLimits['maxStudents'], activeCount: number): Seats {
  if (max === 'unlimited') return { kind: 'unlimited' };
  const remaining = Math.max(0, max - activeCount);
  return { kind: 'limited', max, remaining, full: remaining === 0 };
}
