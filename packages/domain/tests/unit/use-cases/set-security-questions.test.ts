import { describe, it, expect, beforeEach } from 'vitest';
import { SetSecurityQuestions } from '../../../src/use-cases/set-security-questions';
import { InMemorySecurityQuestionRepository } from '../fakes/in-memory-security-question-repository';
import { InMemoryAuthAuditLogRepository } from '../fakes/in-memory-auth-audit-log-repository';
import { fakeHasher } from '../fakes/hasher';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';

describe('SetSecurityQuestions', () => {
  let repo: InMemorySecurityQuestionRepository;
  let auditLog: InMemoryAuthAuditLogRepository;
  let useCase: SetSecurityQuestions;
  const hasher = fakeHasher();

  const validInput = {
    questions: [
      { questionKey: 'first-employer' as const, answer: 'Lycée Al Amal' },
      { questionKey: 'birth-city' as const, answer: 'Casablanca' },
      { questionKey: 'first-car' as const, answer: 'Renault 4' },
    ],
  };

  beforeEach(() => {
    repo = new InMemorySecurityQuestionRepository();
    auditLog = new InMemoryAuthAuditLogRepository();
    useCase = new SetSecurityQuestions(repo, auditLog, hasher, fakeClock(), fakeIds());
  });

  describe('happy path', () => {
    it('stores three hashed answers, never the plaintext', async () => {
      await useCase.execute('admin', validInput);

      const stored = await repo.findAll();
      expect(stored).toHaveLength(3);
      for (const row of stored) {
        expect(row.answerHash).not.toBe('Casablanca');
        expect(row.answerHash).not.toBe('casablanca');
        expect(row.id).toMatch(/^secq_/);
      }
    });

    it('records a security-questions-set audit event', async () => {
      await useCase.execute('admin', validInput);

      const events = auditLog.list().filter((e) => e.eventType === 'security-questions-set');
      expect(events).toHaveLength(1);
      expect(events[0]?.username).toBe('admin');
    });

    it('replaces a previously-set set entirely', async () => {
      await useCase.execute('admin', validInput);
      const otherInput = {
        questions: [
          { questionKey: 'favorite-teacher' as const, answer: 'Mme Fatima' },
          { questionKey: 'childhood-street' as const, answer: 'Rue des Fleurs' },
          { questionKey: 'first-job-title' as const, answer: 'Vendeur' },
        ],
      };

      await useCase.execute('admin', otherInput);

      const stored = await repo.findAll();
      expect(stored).toHaveLength(3);
      expect(stored.map((q) => q.questionKey).sort()).toEqual(
        ['childhood-street', 'favorite-teacher', 'first-job-title'].sort(),
      );
    });
  });

  describe('validation errors', () => {
    it('rejects fewer than three questions', async () => {
      await expect(
        useCase.execute('admin', { questions: validInput.questions.slice(0, 2) }),
      ).rejects.toThrow();
    });

    it('rejects duplicate question keys', async () => {
      const duplicate = {
        questions: [
          { questionKey: 'birth-city' as const, answer: 'Casablanca' },
          { questionKey: 'birth-city' as const, answer: 'Rabat' },
          { questionKey: 'first-car' as const, answer: 'Renault 4' },
        ],
      };
      await expect(useCase.execute('admin', duplicate)).rejects.toThrow();
    });

    it('rejects a too-short answer', async () => {
      const tooShort = {
        questions: [
          { questionKey: 'birth-city' as const, answer: 'C' },
          { questionKey: 'first-car' as const, answer: 'Renault 4' },
          { questionKey: 'first-employer' as const, answer: 'Lycée Al Amal' },
        ],
      };
      await expect(useCase.execute('admin', tooShort)).rejects.toThrow();
    });
  });
});
