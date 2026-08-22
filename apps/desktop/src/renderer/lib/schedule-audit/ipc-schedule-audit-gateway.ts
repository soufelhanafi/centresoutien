import type { StrandedSessionGroupDto } from '../../../shared/ipc/contract';
import type { ScheduleAuditGateway } from './schedule-audit-gateway';
import type { StrandedGroupView, StrandedSessionView } from './stranded-session-view';

type StrandedSessionDto = StrandedSessionGroupDto['occurrences'][number];

/**
 * The real {@link ScheduleAuditGateway} (SOU-201, SOU-296): maps the two methods
 * onto the `session.audit.outside-hours` (read) and `session.cancel`
 * (per-occurrence soft-delete) IPC channels. No business logic — the domain use
 * cases behind the channels own the plan gate, the override-aware hours, the
 * grouping, and the tombstone write. `centerCode` / `updatedBy` are injected in
 * main, never sent from the renderer. Mirrors every other IPC gateway.
 *
 * SOU-296: the domain returns `groups` already collapsed by reason+weekday+
 * resource; the gateway only translates the wire rows into the renderer's view
 * shape (`count` from the DTO, occurrences via their multi-reason `reasons`).
 */
class IpcScheduleAuditGateway implements ScheduleAuditGateway {
  async listOutsideHours(): Promise<readonly StrandedGroupView[]> {
    const { groups } = await window.api.invoke('session.audit.outside-hours', {});
    return groups.map(toStrandedGroupView);
  }

  async cancel(id: string): Promise<void> {
    await window.api.invoke('session.cancel', { id });
  }
}

function toStrandedGroupView(dto: StrandedSessionGroupDto): StrandedGroupView {
  return {
    key: dto.key,
    reason: dto.reason,
    weekday: dto.weekday,
    resourceKind: dto.resourceKind,
    resourceId: dto.resourceId,
    count: dto.count,
    occurrences: dto.occurrences.map(toStrandedSessionView),
  };
}

function toStrandedSessionView(dto: StrandedSessionDto): StrandedSessionView {
  return { session: dto.session, reasons: dto.reasons };
}

export const ipcScheduleAuditGateway: ScheduleAuditGateway = new IpcScheduleAuditGateway();
