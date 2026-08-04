import { describe, it, expect, beforeEach } from 'vitest';
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
    { questionKey: 'birth-city' as const, answer: '  CASABLANCA  ' },
    { questionKey: 'first-car' as const, answer: 'renault 4' },
  ],
};

describe('VerifySecurityAnswers', () => {
  let repo: InMemorySecurityQuestionRepository;
  let throttle: InMemorySecurityQuestionThrottleStore;
  let auditLog: InMemoryAuthAuditLogRepository;
  let useCase: VerifySecurityAnswers;
  const hasher = fakeHasher();

  beforeEach(async () => {
    repo = new InMemorySecurityQuestionRepository();
    throttle = new InMemorySecurityQuestionThrottleStore();
    auditLog = new InMemoryAuthAuditLogRepository();
    useCase = new VerifySecurityAnswers(
      repo,
      throttle,
      new SecurityQuestionThrottlePolicy(),
      auditLog,
      hasher,
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

  describe('happy path', () => {
    it('succeeds when all three answers match, case/whitespace-insensitively', async () => {
      const result = await useCase.execute('admin', CORRECT_ANSWERS);
      expect(result.outcome).toBe('success');
    });

    it('resets the throttle on success', async () => {
      await useCase.execute('admin', {
        answers: [
          { questionKey: 'first-employer', answer: 'wrong' },
          { questionKey: 'birth-city', answer: 'Casablanca' },
          { questionKey: 'first-car', answer: 'Renault 4' },
        ],
      });
      await useCase.execute('admin', CORRECT_ANSWERS);

      const state = await throttle.get();
      expect(state.failedAttempts).toBe(0);
    });

    it('records a security-questions-verified audit event', async () => {
      await useCase.execute('admin', CORRECT_ANSWERS);
      const events = auditLog.list().filter((e) => e.eventType === 'security-questions-verified');
      expect(events).toHaveLength(1);
    });
  });

  describe('wrong answers', () => {
    it('fails when any single answer is wrong, and reports remaining attempts', async () => {
      const result = await useCase.execute('admin', {
        answers: [
          { questionKey: 'first-employer', answer: 'wrong' },
          { questionKey: 'birth-city', answer: 'Casablanca' },
          { questionKey: 'first-car', answer: 'Renault 4' },
        ],
      });

      expect(result).toEqual({ outcome: 'invalid-answer', remainingAttempts: 2 });
    });

    it('records a security-questions-answer-failed audit event', async () => {
      await useCase.execute('admin', {
        answers: [
          { questionKey: 'first-employer', answer: 'wrong' },
          { questionKey: 'birth-city', answer: 'Casablanca' },
          { questionKey: 'first-car', answer: 'Renault 4' },
        ],
      });
      const events = auditLog
        .list()
        .filter((e) => e.eventType === 'security-questions-answer-failed');
      expect(events).toHaveLength(1);
    });
  });

  describe('lockout', () => {
    it('locks out after the third consecutive wrong attempt', async () => {
      const wrong = {
        answers: [
          { questionKey: 'first-employer' as const, answer: 'wrong' },
          { questionKey: 'birth-city' as const, answer: 'Casablanca' },
          { questionKey: 'first-car' as const, answer: 'Renault 4' },
        ],
      };

      await useCase.execute('admin', wrong);
      await useCase.execute('admin', wrong);
      const third = await useCase.execute('admin', wrong);

      expect(third.outcome).toBe('locked-out');
    });

    it('rejects even correct answers while locked out', async () => {
      const wrong = {
        answers: [
          { questionKey: 'first-employer' as const, answer: 'wrong' },
          { questionKey: 'birth-city' as const, answer: 'Casablanca' },
          { questionKey: 'first-car' as const, answer: 'Renault 4' },
        ],
      };
      await useCase.execute('admin', wrong);
      await useCase.execute('admin', wrong);
      await useCase.execute('admin', wrong);

      const result = await useCase.execute('admin', CORRECT_ANSWERS);
      expect(result.outcome).toBe('locked-out');
    });
  });

  describe('no questions configured', () => {
    it('returns invalid-answer, same as a wrong answer, and registers the throttle attempt', async () => {
      const emptyRepo = new InMemorySecurityQuestionRepository();
      const emptyThrottle = new InMemorySecurityQuestionThrottleStore();
      const fresh = new VerifySecurityAnswers(
        emptyRepo,
        emptyThrottle,
        new SecurityQuestionThrottlePolicy(),
        new InMemoryAuthAuditLogRepository(),
        hasher,
        fakeClock(),
        fakeIds(),
      );

      const result = await fresh.execute('admin', CORRECT_ANSWERS);

      expect(result).toEqual({ outcome: 'invalid-answer', remainingAttempts: 2 });
      const state = await emptyThrottle.get();
      expect(state.failedAttempts).toBe(1);
    });
  });
});
