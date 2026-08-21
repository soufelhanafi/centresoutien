import type { StrandedSessionDto } from '../../../shared/ipc/contract';
import type { ScheduleAuditGateway } from './schedule-audit-gateway';
import { canonicalizeReason, type StrandedSessionView } from './stranded-session-view';

/**
 * The real {@link ScheduleAuditGateway} (SOU-201): maps the two methods onto the
 * `session.audit.outside-hours` (read) and `session.cancel` (per-occurrence
 * soft-delete) IPC channels. No business logic — the
 * `AuditSessionsOutsideEffectiveHours` / `CancelSession` use cases behind the
 * channels own the plan gate, the override-aware hours, and the tombstone write.
 * `centerCode` / `updatedBy` are injected in main, never sent from the renderer.
 * Mirrors every other IPC gateway (`IpcSessionGeneratorGateway`).
 *
 * SOU-296: each wire row's reason is normalized to the canonical taxonomy at the
 * boundary ({@link canonicalizeReason}), so the UI renders one vocabulary while
 * the backend still emits the legacy codes.
 */
class IpcScheduleAuditGateway implements ScheduleAuditGateway {
  async listOutsideHours(): Promise<readonly StrandedSessionView[]> {
    const { sessionsOutsideEffectiveHours } = await window.api.invoke(
      'session.audit.outside-hours',
      {},
    );
    return sessionsOutsideEffectiveHours.map(toStrandedSessionView);
  }

  async cancel(id: string): Promise<void> {
    await window.api.invoke('session.cancel', { id });
  }
}

function toStrandedSessionView(dto: StrandedSessionDto): StrandedSessionView {
  return { session: dto.session, reason: canonicalizeReason(dto.reason) };
}

export const ipcScheduleAuditGateway: ScheduleAuditGateway = new IpcScheduleAuditGateway();
