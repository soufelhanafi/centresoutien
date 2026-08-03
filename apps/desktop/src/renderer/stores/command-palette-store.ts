import { create } from 'zustand';

/**
 * Open state of the global command palette (SOU-43), shared between the header
 * trigger button and the palette host in the app shell. Pure Presentation-layer
 * UI state, held in memory for the session — nothing to persist.
 */
type CommandPaletteState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
}));
