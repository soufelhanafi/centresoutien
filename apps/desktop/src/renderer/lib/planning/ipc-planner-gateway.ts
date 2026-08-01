import type { PlannerGateway } from './planner-gateway';
import type { PlannerSessionView } from './planner-view';

/**
 * The real {@link PlannerGateway}: reads the center's week off the `session.week`
 * IPC channel (SOU-118 enriched it with the group/subject/room/teacher join, so
 * the DTO now carries everything the grid renders). No business logic — the
 * `ListWeekSessions` use case behind the channel owns it. `centerCode` is injected
 * in main, never sent from the renderer, so the request is empty. Mirrors every
 * other IPC gateway (`IpcTeachersGateway`, `IpcHolidaysGateway`).
 */
class IpcPlannerGateway implements PlannerGateway {
  async listWeek(): Promise<readonly PlannerSessionView[]> {
    const { sessions } = await window.api.invoke('session.week', {});
    return sessions;
  }
}

export const ipcPlannerGateway: PlannerGateway = new IpcPlannerGateway();
