import type { AuthAuditLogRepository } from '../../../src/ports/auth-audit-log-repository';
import type { AuthAuditEvent } from '../../../src/entities/auth-audit-event';

export class InMemoryAuthAuditLogRepository implements AuthAuditLogRepository {
  private events: AuthAuditEvent[] = [];

  async record(event: AuthAuditEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }

  list(): readonly AuthAuditEvent[] {
    return this.events;
  }
}
