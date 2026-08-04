import type { SecurityQuestionRepository } from '../ports/security-question-repository';
import type { AuthAuditLogRepository } from '../ports/auth-audit-log-repository';
import type { PasswordHasher } from '../ports/password-hasher';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import {
  SECURITY_QUESTION_ID_PREFIX,
  type SecurityQuestion,
  type SecurityQuestionId,
} from '../entities/security-question';
import { setSecurityQuestionsSchema, type SetSecurityQuestionsInput } from '../schemas/security-question';
import { normalizeSecurityAnswer } from '../policies/security-answer-normalization';
import {
  AUTH_AUDIT_EVENT_ID_PREFIX,
  type AuthAuditEvent,
  type AuthAuditEventId,
} from '../entities/auth-audit-event';

export type { SetSecurityQuestionsInput };

/**
 * Sets (or replaces) the three security questions used by the SOU-155 reset
 * path. Authenticated settings-screen flow, not throttled — the throttle
 * guards *answering* the questions to reset a password, not configuring them.
 */
export class SetSecurityQuestions {
  constructor(
    private readonly questions: SecurityQuestionRepository,
    private readonly auditLog: AuthAuditLogRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(username: string, input: SetSecurityQuestionsInput): Promise<void> {
    const { questions } = setSecurityQuestionsSchema.parse(input);
    const now = this.clock.now();

    const rows: SecurityQuestion[] = [];
    for (const q of questions) {
      rows.push({
        id: this.ids.next(SECURITY_QUESTION_ID_PREFIX) as SecurityQuestionId,
        questionKey: q.questionKey,
        answerHash: await this.hasher.hash(normalizeSecurityAnswer(q.answer)),
        createdAt: now,
        updatedAt: now,
      });
    }

    await this.questions.saveAll(rows);

    const event: AuthAuditEvent = {
      id: this.ids.next(AUTH_AUDIT_EVENT_ID_PREFIX) as AuthAuditEventId,
      eventType: 'security-questions-set',
      username,
      timestamp: now,
      metadata: { questionKeys: questions.map((q) => q.questionKey) },
    };
    await this.auditLog.record(event);
  }
}
