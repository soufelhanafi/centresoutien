import { describe, it, expect, beforeEach } from 'vitest';
import { RequestPasswordResetViaSecurityQuestions } from '../../../src/use-cases/request-password-reset-via-security-questions';
import { VerifySecurityAnswers } from '../../../src/use-cases/verify-security-answers';
import { SetSecurityQuestions } from '../../../src/use-cases/set-security-questions';
import { InMemorySecurityQuestionRepository } from '../fakes/in-memory-security-question-repository';
import { InMemorySecurityQuestionThrottleStore } from '../fakes/in-memory-security-question-throttle-store';
import { InMemoryAuthAuditLogRepository } from '../fakes/in-memory-auth-audit-log-repository';
import { SecurityQuestionThrottlePolicy } from '../../../src/policies/security-question-throttle-policy';
import { fakeHasher } from '../fakes/hasher';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

const CORRECT_ANSWERS = {
  answers: [
    { questionKey: 'first-employer' as const, answer: 'Lycée Al Amal' },
    { questionKey: 'birth-city' as const, answer: 'Casablanca' },
    { questionKey: 'first-car' as const, answer: 'Renault 4' },
  ],
};

const WRONG_ANSWERS = {
  answers: [
    { questionKey: 'first-employer' as const, answer: 'wrong' },
    { questionKey: 'birth-city' as const, answer: 'Casablanca' },
    { questionKey: 'first-car' as const, answer: 'Renault 4' },
  ],
};

describe('RequestPasswordResetViaSecurityQuestions', () => {
  let repo: InMemorySecurityQuestionRepository;
  let throttle: InMemorySecurityQuestionThrottleStore;
  let auditLog: InMemoryAuthAuditLogRepository;
  let useCase: RequestPasswordResetViaSecurityQuestions;
  const hasher = fakeHasher();

  beforeEach(async () => {
    repo = new InMemorySecurityQuestionRepository();
    throttle = new InMemorySecurityQuestionThrottleStore();
    auditLog = new InMemoryAuthAuditLogRepository();

    const verifyAnswers = new VerifySecurityAnswers(
      repo,
      throttle,
      new SecurityQuestionThrottlePolicy(),
      auditLog,
      hasher,
      fakeClock(),
      fakeIds(),
    );
    useCase = new RequestPasswordResetViaSecurityQuestions(
      verifyAnswers,
      auditLog,
      fakeClock(),
      fakeIds(),
    );

    const setup = new SetSecurityQuestions(repo, auditLog, hasher, fakeClock(), fakeIds());
    await setup.execute('admin', {
      questions: [
        { questionKey: 'first-employer', answer: 'Lycée Al Amal' },
        { questionKey: 'birth-city', answer: 'Casablanca' },
        { questionKey: 'first-car', answer: 'Renault 4' },
      ],
    });
  });

  it('resolves correct answers to confirmation-required, never a completed reset', async () => {
    const result = await useCase.execute('admin', CORRECT_ANSWERS);
    expect(result).toEqual({ outcome: 'confirmation-required' });
  });

  it('records a security-questions-reset-blocked-pending-confirmation audit event on correct answers', async () => {
    await useCase.execute('admin', CORRECT_ANSWERS);
    const events = auditLog
      .list()
      .filter((e) => e.eventType === 'security-questions-reset-blocked-pending-confirmation');
    expect(events).toHaveLength(1);
  });

  it('passes through an invalid-answer outcome without starting a reset', async () => {
    const result = await useCase.execute('admin', WRONG_ANSWERS);
    expect(result).toEqual({ outcome: 'invalid-answer', remainingAttempts: 2 });

    const blockedEvents = auditLog
      .list()
      .filter((e) => e.eventType === 'security-questions-reset-blocked-pending-confirmation');
    expect(blockedEvents).toHaveLength(0);
  });

  it('passes through a locked-out outcome after three wrong attempts', async () => {
    await useCase.execute('admin', WRONG_ANSWERS);
    await useCase.execute('admin', WRONG_ANSWERS);
    const third = await useCase.execute('admin', WRONG_ANSWERS);

    expect(third.outcome).toBe('locked-out');
  });
});
