import type { PlanningResetResult } from './reset-planning';
import { mockPlanningResetGateway } from './mock-planning-reset-gateway';

/**
 * The seam the reset-planning UI depends on (Dependency Inversion). The hook calls
 * this interface, never `window.api` directly, so the concrete adapter is swapped
 * in one place with no change to any component.
 *
 * ## Contract status (SOU-295)
 * The real `planning.reset` channel is now merged on the domain side. Its request
 * is validated by `resetPlanningSchema` as exactly `{ cutoffDate: string }` — a
 * 'YYYY-MM-DD' civil date the renderer computes from the app clock; `centerCode`,
 * `deviceOrigin` and `updatedBy` are injected in main from the envelope context,
 * never sent from the renderer, exactly like every other write gateway
 * (`IpcSessionWriteGateway`). The reset is a GLOBAL wipe of the center's entire
 * future planning (all groups/rooms/teachers), never a filtered subset. It returns
 * `{ sessionsDeleted, templatesDeleted }`; the UI toasts `sessionsDeleted` as the
 * "N séances" count. Until that channel lands in THIS worktree's shared IPC
 * contract (it arrives when the domain branch merges into the integration branch)
 * this ships against {@link mockPlanningResetGateway}; the swap is this one line:
 *
 * ```ts
 * export const planningResetGateway: PlanningResetGateway = ipcPlanningResetGateway;
 * ```
 *
 * where the IPC adapter is:
 *
 * ```ts
 * class IpcPlanningResetGateway implements PlanningResetGateway {
 *   reset(cutoffDate: string) { return window.api.invoke('planning.reset', { cutoffDate }); }
 * }
 * ```
 */
export interface PlanningResetGateway {
  /** Wipes future sessions from `cutoffDate` (inclusive) and stops their recurrence. */
  reset(cutoffDate: string): Promise<PlanningResetResult>;
}

/** The active gateway. Swap to the real IPC adapter once `planning.reset` merges. */
export const planningResetGateway: PlanningResetGateway = mockPlanningResetGateway;
