import { describe, it, expect, beforeEach } from 'vitest';
import { VerifyRecoveryCode } from '../../../src/use-cases/verify-recovery-code';
import { InMemoryRecoveryCodeRepository } from '../fakes/in-memory-recovery-code-repository';
import { InMemoryAuthAuditLogRepository } from '../fakes/in-memory-auth-audit-log-repository';
import { InMemoryLoginThrottleStore } from '../fakes/in-memory-login-throttle-store';
import { LoginThrottlePolicy } from '../../../src/policies/login-throttle-policy';
import { fakeHasher } from '../fakes/hasher';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import { InvalidRecoveryCodeError, NoRecoveryCodesError } from '../../../src/errors/auth-errors';
import type { RecoveryCodeId } from '../../../src/entities/recovery-code';

describe('VerifyRecoveryCode', () => {
  let repo: InMemoryRecoveryCodeRepository;
  let auditLog: InMemoryAuthAuditLogRepository;
  let throttle: InMemoryLoginThrottleStore;
  let useCase: VerifyRecoveryCode;
  const hasher = fakeHasher();
  const validPlain = 'AABB-CCDD-EEFF-0011';

  beforeEach(() => {
    repo = new InMemoryRecoveryCodeRepository();
    auditLog = new InMemoryAuthAuditLogRepository();
    throttle = new InMemoryLoginThrottleStore();
    useCase = new VerifyRecoveryCode(
      repo,
      auditLog,
      hasher,
      throttle,
      new LoginThrottlePolicy(),
      fakeClock(),
      fakeIds(),
    );
  });

  it('validates a valid code but does not consume it', async () => {
    const hashed = await hasher.hash(validPlain);
    await repo.saveMany([
      {
        id: 'rec_1' as RecoveryCodeId,
        codeHash: hashed,
        consumed: false,
        createdAt: new Date(),
        consumedAt: null,
      },
    ]);

    const result = await useCase.execute({ recoveryCode: validPlain, username: 'admin' });
    expect(result.outcome).toBe('success');

    const remaining = await repo.countUnconsumed();
    expect(remaining).toBe(1);
  });

  it('throws InvalidRecoveryCodeError for a wrong code', async () => {
    const hashed = await hasher.hash(validPlain);
    await repo.saveMany([
      {
        id: 'rec_1' as RecoveryCodeId,
        codeHash: hashed,
        consumed: false,
        createdAt: new Date(),
        consumedAt: null,
      },
    ]);

    await expect(
      useCase.execute({ recoveryCode: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ', username: 'admin' }),
    ).rejects.toBeInstanceOf(InvalidRecoveryCodeError);
  });

  it('throws InvalidRecoveryCodeError when code is already consumed', async () => {
    const hashed = await hasher.hash(validPlain);
    const otherHashed = await hasher.hash('BBBB-CCCC-DDDD-EEEE');
    await repo.saveMany([
      {
        id: 'rec_1' as RecoveryCodeId,
        codeHash: hashed,
        consumed: true,
        createdAt: new Date(),
        consumedAt: new Date(),
      },
      {
        id: 'rec_2' as RecoveryCodeId,
        codeHash: otherHashed,
        consumed: false,
        createdAt: new Date(),
        consumedAt: null,
      },
    ]);

    await expect(
      useCase.execute({ recoveryCode: validPlain, username: 'admin' }),
    ).rejects.toBeInstanceOf(InvalidRecoveryCodeError);
  });

  it('throws NoRecoveryCodesError when no codes exist', async () => {
    await expect(
      useCase.execute({ recoveryCode: validPlain, username: 'admin' }),
    ).rejects.toBeInstanceOf(NoRecoveryCodesError);
  });

  it('records failed-attempt audit events', async () => {
    const hashed = await hasher.hash(validPlain);
    await repo.saveMany([
      {
        id: 'rec_1' as RecoveryCodeId,
        codeHash: hashed,
        consumed: false,
        createdAt: new Date(),
        consumedAt: null,
      },
    ]);

    await expect(
      useCase.execute({ recoveryCode: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ', username: 'admin' }),
    ).rejects.toThrow();

    const failedEvents = auditLog.list().filter((e) => e.eventType === 'recovery-code-failed');
    expect(failedEvents).toHaveLength(1);
    expect(failedEvents[0].username).toBe('admin');
  });
});
