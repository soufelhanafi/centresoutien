import { create } from 'zustand';
import { PLANS } from '@centresoutien/domain';
import type { FeatureFlag, Plan, PlanId } from '@centresoutien/domain';

/**
 * The active plan for UI gating. Hydrated from the main process (`plan.get`) at
 * startup; `setPlan` also backs the dev switcher. UI hiding is cosmetic — the
 * domain PlanPolicy is the real enforcement (CLAUDE.md §4).
 */
type PlanState = {
  planId: PlanId;
  plan: Plan;
  setPlan: (id: PlanId, features?: readonly FeatureFlag[]) => void;
};

export const usePlanStore = create<PlanState>((set) => ({
  planId: 'essentiel',
  plan: PLANS.essentiel,
  setPlan: (id, features) =>
    set({
      planId: id,
      plan: features === undefined ? PLANS[id] : { ...PLANS[id], features: new Set(features) },
    }),
}));
