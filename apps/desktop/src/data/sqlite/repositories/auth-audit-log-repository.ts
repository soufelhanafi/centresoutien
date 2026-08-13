import type { Database as DB } from 'better-sqlite3';
import type { AuthAuditEvent, AuthAuditLogRepository } from '@centresoutien/domain';

// Append an audit row. Exported so the atomic reset unit-of-work (SOU-169)
// records its events through the same statement — one source of truth.
export const AUTH_AUDIT_LOG_INSERT_SQL = `
  INSERT INTO auth_audit_log (id, event_type, username, created_at, metadata)
  VALUES (@id, @event_type, @username, @created_at, @metadata)
`;

// Bind params for AUTH_AUDIT_LOG_INSERT_SQL.
export function authAuditEventToParams(event: AuthAuditEvent) {
  return {
    id: event.id as string,
    event_type: event.eventType,
    username: event.username,
    created_at: event.timestamp.toISOString(),
    metadata: JSON.stringify(event.metadata),
  };
}

export class SqliteAuthAuditLogRepository implements AuthAuditLogRepository {
  constructor(private readonly db: DB) {}

  async record(event: AuthAuditEvent): Promise<void> {
    this.db.prepare(AUTH_AUDIT_LOG_INSERT_SQL).run(authAuditEventToParams(event));
  }
}
