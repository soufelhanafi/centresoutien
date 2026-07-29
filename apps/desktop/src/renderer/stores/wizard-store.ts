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
   * The admin step's username, retained in memory so returning to the step via
   * Back rehydrates what was typed. Mirrors how the Language step keeps its
   * choice across navigation. The password and its confirmation are deliberately
   * NOT retained — they are sensitive and must not live in shared state.
   */
  adminUsername: string;
  /**
   * Build the initial state for the active plan. Idempotent once the user has
   * begun — so a late plan hydration (`plan.get`) can still correct the Holidays
   * step before step one, but never resets real progress.
   */
  init: (plan: Plan) => void;
  submit: () => void;
  skip: () => void;
  back: () => void;
  setAdminUsername: (username: string) => void;
};

function hasStarted(state: WizardState | null): boolean {
  return state !== null && (state.currentIndex > 0 || state.completed.size > 0);
}

export const useWizardStore = create<WizardStore>((set) => ({
  state: null,
  adminUsername: '',
  init: (plan) =>
    set((store) => {
      if (hasStarted(store.state)) return store;
      return { state: initWizard(new PlanPolicy(plan)) };
    }),
  submit: () => set((store) => (store.state ? { state: submitStep(store.state) } : store)),
  skip: () => set((store) => (store.state ? { state: skipStep(store.state) } : store)),
  back: () => set((store) => (store.state ? { state: goToPreviousStep(store.state) } : store)),
  setAdminUsername: (username) => set({ adminUsername: username }),
}));
