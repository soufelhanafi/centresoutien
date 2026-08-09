import { create } from 'zustand';
import type { FeatureFlag } from '@centresoutien/domain';

type UpgradePromptState = {
  /** The gated feature whose upgrade dialog is open, or `null` when closed. */
  feature: FeatureFlag | null;
  open: (feature: FeatureFlag) => void;
  close: () => void;
};

/**
 * Backs one shared `<UpgradeDialog />` (SOU-85): every gated CTA opens it through
 * this store instead of mounting its own dialog. Presentation state, not persisted.
 */
export const useUpgradePromptStore = create<UpgradePromptState>((set) => ({
  feature: null,
  open: (feature) => set({ feature }),
  close: () => set({ feature: null }),
}));
