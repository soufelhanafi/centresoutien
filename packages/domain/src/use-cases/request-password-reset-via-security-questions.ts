import type { VerifySecurityAnswers, VerifySecurityAnswersInput } from './verify-security-answers';
import type { AuthAuditLogRepository } from '../ports/auth-audit-log-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import {
  AUTH_AUDIT_EVENT_ID_PREFIX,
  type AuthAuditEvent,
  type AuthAuditEventId,
} from '../entities/auth-audit-event';

export type RequestPasswordResetViaSecurityQuestionsResult =
  | { readonly outcome: 'confirmation-required' }
  | { readonly outcome: 'invalid-answer'; readonly remainingAttempts: number }
  | { readonly outcome: 'locked-out'; readonly lockedUntil: number };

/**
 * Entry point for the SOU-155 reset path. Answering all three questions
 * correctly only *starts* a reset — it never changes the password. v2 has a
 * single local admin account, which this KICKOFF treats as owner-tier, so
 * every successful verification here stops at `'confirmation-required'`:
 * completing the reset needs the SOU-157 email-relay confirmation step,
 * which doesn't exist yet. There is deliberately no `newPassword` parameter
 * and no path in this use case that writes a password — the block can't be
 * bypassed by a future caller forgetting a check. When SOU-157 ships, the
 * completion step is a new use case gated on a confirmation token from that
 * flow, not an addition to this one.
 */
export class RequestPasswordResetViaSecurityQuestions {
  constructor(
    private readonly verifyAnswers: VerifySecurityAnswers,
    private readonly auditLog: AuthAuditLogRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(
    username: string,
    input: VerifySecurityAnswersInput,
  ): Promise<RequestPasswordResetViaSecurityQuestionsResult> {
    const result = await this.verifyAnswers.execute(username, input);
    if (result.outcome !== 'success') return result;

    const now = this.clock.now();
    const event: AuthAuditEvent = {
      id: this.ids.next(AUTH_AUDIT_EVENT_ID_PREFIX) as AuthAuditEventId,
      eventType: 'security-questions-reset-blocked-pending-confirmation',
      username,
      timestamp: now,
      metadata: {},
    };
    await this.auditLog.record(event);

    return { outcome: 'confirmation-required' };
  }
}
