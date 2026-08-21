import type { PlanningResetResult } from './reset-planning';
import { ipcPlanningResetGateway } from './ipc-planning-reset-gateway';

/**
 * The seam the reset-planning UI depends on (Dependency Inversion). The hook calls
 * this interface, never `window.api` directly, so the concrete adapter is swapped
 * in one place with no change to any component.
 *
 * ## Contract (SOU-295)
 * The `planning.reset` channel validates its request via `resetPlanningSchema` as
 * exactly `{ cutoffDate: string }` — a 'YYYY-MM-DD' civil date the renderer computes
 * from the app clock; `centerCode`, `deviceOrigin` and `updatedBy` are injected in
 * main from the envelope context, never sent from the renderer, exactly like every
 * other write gateway (`IpcSessionWriteGateway`). The reset is a GLOBAL wipe of the
 * center's entire future planning (all groups/rooms/teachers), never a filtered
 * subset. It returns `{ sessionsDeleted, templatesDeleted }`; the UI toasts
 * `sessionsDeleted` as the "N séances" count.
 */
export interface PlanningResetGateway {
  /** Wipes future sessions from `cutoffDate` (inclusive) and stops their recurrence. */
  reset(cutoffDate: string): Promise<PlanningResetResult>;
}

/** The active gateway — the real `planning.reset` IPC adapter. */
export const planningResetGateway: PlanningResetGateway = ipcPlanningResetGateway;
