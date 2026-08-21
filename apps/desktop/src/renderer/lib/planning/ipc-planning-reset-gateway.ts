import type { PlanningResetResult } from './reset-planning';
import type { PlanningResetGateway } from './planning-reset-gateway';

/**
 * Real {@link PlanningResetGateway} over the `planning.reset` IPC channel (SOU-295).
 * Sends exactly `{ cutoffDate }`; `centerCode`, `deviceOrigin` and `updatedBy` are
 * injected in main from the envelope context, never by the renderer — the same
 * shape every other write gateway uses. Returns `{ sessionsDeleted, templatesDeleted }`.
 */
class IpcPlanningResetGateway implements PlanningResetGateway {
  reset(cutoffDate: string): Promise<PlanningResetResult> {
    return window.api.invoke('planning.reset', { cutoffDate });
  }
}

export const ipcPlanningResetGateway: PlanningResetGateway = new IpcPlanningResetGateway();
