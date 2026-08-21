import type { PlanningResetResult } from './reset-planning';
import type { PlanningResetGateway } from './planning-reset-gateway';

/**
 * Interim {@link PlanningResetGateway} standing in for the `planning.reset` IPC
 * channel until it lands in this worktree's shared contract (the domain side is
 * merged; it reaches this branch on integration) (SOU-295). It accepts the cutoff
 * and reports a zero-count success — no persistence — so the danger-zone flow
 * (dialog, cutoff choice, typed confirmation, success toast) is fully exercisable
 * now; swapping in the real adapter is a one-line change in
 * {@link planningResetGateway}.
 */
class MockPlanningResetGateway implements PlanningResetGateway {
  async reset(cutoffDate: string): Promise<PlanningResetResult> {
    void cutoffDate;
    return { sessionsDeleted: 0, templatesDeleted: 0 };
  }
}

export const mockPlanningResetGateway: PlanningResetGateway = new MockPlanningResetGateway();
