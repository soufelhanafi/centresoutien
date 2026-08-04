import type { SecurityQuestionRepository } from '../ports/security-question-repository';
import type { SecurityQuestionThrottleStore } from '../ports/security-question-throttle-store';
import type { AuthAuditLogRepository } from '../ports/auth-audit-log-repository';
import type { PasswordHasher } from '../ports/password-hasher';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import type { SecurityQuestionThrottlePolicy } from '../policies/security-question-throttle-policy';
import {
  verifySecurityAnswersSchema,
  type VerifySecurityAnswersInput,
} from '../schemas/security-question';
import { normalizeSecurityAnswer } from '../policies/security-answer-normalization';
import { NoSecurityQuestionsSetError } from '../errors/auth-errors';
import {
  AUTH_AUDIT_EVENT_ID_PREFIX,
  type AuthAuditEvent,
  type AuthAuditEventId,
} from '../entities/auth-audit-event';

export type { VerifySecurityAnswersInput };

export type VerifySecurityAnswersResult =
  | { readonly outcome: 'success' }
  | { readonly outcome: 'invalid-answer'; readonly remainingAttempts: number }
  | { readonly outcome: 'locked-out'; readonly lockedUntil: number };

/**
 * Verifies all three security-question answers against the stored hashes
 * (SOU-155). Unlike `VerifyRecoveryCode` (any one of many codes matches),
 * this requires every one of the three stored answers to match — it is an
 * identity check, not a single-use token redemption. Throttled at 3 wrong
 * attempts via {@link SecurityQuestionThrottlePolicy}, independent of the
 * login/recovery-code lockout.
 */
export class VerifySecurityAnswers {
  constructor(
    private readonly questions: SecurityQuestionRepository,
    private readonly throttleStore: SecurityQuestionThrottleStore,
    private readonly throttlePolicy: SecurityQuestionThrottlePolicy,
    private readonly auditLog: AuthAuditLogRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(username: string, input: VerifySecurityAnswersInput): Promise<VerifySecurityAnswersResult> {
    const { answers } = verifySecurityAnswersSchema.parse(input);
    const now = this.clock.now();

    const state = await this.throttleStore.get();
    const lockedUntil = this.throttlePolicy.lockActiveUntil(state, now);
    if (lockedUntil !== null) return { outcome: 'locked-out', lockedUntil };

    const stored = await this.questions.findAll();
    if (stored.length === 0) throw new NoSecurityQuestionsSetError();

    const answerByKey = new Map(answers.map((a) => [a.questionKey, a.answer]));
    let allCorrect = stored.length === answerByKey.size;
    for (const question of stored) {
      const submitted = answerByKey.get(question.questionKey);
      const matches =
        submitted !== undefined &&
        (await this.hasher.verify(question.answerHash, normalizeSecurityAnswer(submitted)));
      if (!matches) allCorrect = false;
    }

    if (allCorrect) {
      await this.throttleStore.reset();
      await this.record(username, 'security-questions-verified', now);
      return { outcome: 'success' };
    }

    const next = this.throttlePolicy.registerFailure(state, now);
    await this.throttleStore.save(next);
    await this.record(username, 'security-questions-answer-failed', now);

    const stillLockedUntil = this.throttlePolicy.lockActiveUntil(next, now);
    if (stillLockedUntil !== null) return { outcome: 'locked-out', lockedUntil: stillLockedUntil };
    return { outcome: 'invalid-answer', remainingAttempts: this.throttlePolicy.remainingAttempts(next) };
  }

  private async record(username: string, eventType: AuthAuditEvent['eventType'], now: Date): Promise<void> {
    const event: AuthAuditEvent = {
      id: this.ids.next(AUTH_AUDIT_EVENT_ID_PREFIX) as AuthAuditEventId,
      eventType,
      username,
      timestamp: now,
      metadata: {},
    };
    await this.auditLog.record(event);
  }
}
