import type { Database as DB } from 'better-sqlite3';
import type { AuthAuditEvent, AuthAuditLogRepository } from '@centresoutien/domain';

export class SqliteAuthAuditLogRepository implements AuthAuditLogRepository {
  constructor(private readonly db: DB) {}

  async record(event: AuthAuditEvent): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO auth_audit_log (id, event_type, username, created_at, metadata)
         VALUES (@id, @event_type, @username, @created_at, @metadata)`,
      )
      .run({
        id: event.id as string,
        event_type: event.eventType,
        username: event.username,
        created_at: event.timestamp.toISOString(),
        metadata: JSON.stringify(event.metadata),
      });
  }
}
