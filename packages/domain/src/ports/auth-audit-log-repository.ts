import type { AuthAuditEvent } from '../entities/auth-audit-event';

/**
 * Persistence port for the auth audit log (SOU-154, CNDP/Loi 09-08).
 * Append-only, local infra — no sync envelope, never leaves the device.
 */
export interface AuthAuditLogRepository {
  record(event: AuthAuditEvent): Promise<void>;
}
