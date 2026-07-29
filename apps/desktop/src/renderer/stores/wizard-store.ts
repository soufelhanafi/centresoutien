import { create } from 'zustand';
import {
  PlanPolicy,
  initWizard,
  submitStep,
  skipStep,
  goToPreviousStep,
  type Plan,
  type WizardState,
} from '@centresoutien/domain';

/**
 * First-run wizard progress, held in memory for the session (SOU-25). The store
 * is a thin presentation adapter: it never decides ordering or the non-skippable
 * rule itself — every transition delegates to the pure domain machine, which owns
 * those guarantees. Quitting before completion drops this state, so the wizard
 * restarts; only committed steps (the admin account) survive across launches.
 */
type WizardStore = {
  state: WizardState | null;
  /**
   * Build the initial state for the active plan. Idempotent once the user has
   * begun — so a late plan hydration (`plan.get`) can still correct the Holidays
   * step before step one, but never resets real progress.
   */
  init: (plan: Plan) => void;
  submit: () => void;
  skip: () => void;
  back: () => void;
};

function hasStarted(state: WizardState | null): boolean {
  return state !== null && (state.currentIndex > 0 || state.completed.size > 0);
}

export const useWizardStore = create<WizardStore>((set) => ({
  state: null,
  init: (plan) =>
    set((store) => {
      if (hasStarted(store.state)) return store;
      return { state: initWizard(new PlanPolicy(plan)) };
    }),
  submit: () => set((store) => (store.state ? { state: submitStep(store.state) } : store)),
  skip: () => set((store) => (store.state ? { state: skipStep(store.state) } : store)),
  back: () => set((store) => (store.state ? { state: goToPreviousStep(store.state) } : store)),
}));
