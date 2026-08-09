import { create } from 'zustand';
import type { FeatureFlag } from '@centresoutien/domain';

type UpgradePromptState = {
  /** The gated feature whose upgrade dialog is open, or `null` when closed. */
  feature: FeatureFlag | null;
  open: (feature: FeatureFlag) => void;
  close: () => void;
};

/**
 * One shared upgrade dialog for every gated surface (SOU-85). CTAs across the
 * app all target this store so a single `<UpgradeDialog />` mounts in the shell
 * — no per-surface dialog duplication. Pure Presentation state; not persisted.
 */
export const useUpgradePromptStore = create<UpgradePromptState>((set) => ({
  feature: null,
  open: (feature) => set({ feature }),
  close: () => set({ feature: null }),
}));
