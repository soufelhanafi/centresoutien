import type { Brand } from '../value-objects/brand';

export const AUTH_AUDIT_EVENT_ID_PREFIX = 'aaev';

export type AuthAuditEventId = Brand<string, 'AuthAuditEventId'>;

export type AuthAuditEventType =
  | 'recovery-codes-generated'
  | 'recovery-code-consumed'
  | 'recovery-code-failed'
  | 'password-reset-via-recovery-code';

/**
 * Immutable log of security-relevant auth events for CNDP/Loi 09-08
 * auditability. Local infra — no sync envelope, never leaves the device.
 * `metadata` holds any structured payload specific to the event_type (e.g.
 * the number of codes generated).
 */
export type AuthAuditEvent = {
  readonly id: AuthAuditEventId;
  readonly eventType: AuthAuditEventType;
  readonly username: string;
  readonly timestamp: Date;
  readonly metadata: Record<string, unknown>;
};
