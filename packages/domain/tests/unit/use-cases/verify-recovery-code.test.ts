import { describe, it, expect, beforeEach } from 'vitest';
import { VerifyRecoveryCode } from '../../../src/use-cases/verify-recovery-code';
import { InMemoryRecoveryCodeRepository } from '../fakes/in-memory-recovery-code-repository';
import { InMemoryAuthAuditLogRepository } from '../fakes/in-memory-auth-audit-log-repository';
import { fakeHasher } from '../fakes/hasher';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import { InvalidRecoveryCodeError, NoRecoveryCodesError } from '../../../src/errors/auth-errors';
import type { RecoveryCodeId } from '../../../src/entities/recovery-code';

describe('VerifyRecoveryCode', () => {
  let repo: InMemoryRecoveryCodeRepository;
  let auditLog: InMemoryAuthAuditLogRepository;
  let useCase: VerifyRecoveryCode;
  const hasher = fakeHasher();
  const validPlain = 'AABB-CCDD-EEFF-0011';

  beforeEach(async () => {
    repo = new InMemoryRecoveryCodeRepository();
    auditLog = new InMemoryAuthAuditLogRepository();
    useCase = new VerifyRecoveryCode(repo, auditLog, hasher, fakeClock(), fakeIds());
  });

  it('verifies a valid code and marks it consumed', async () => {
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

    await useCase.execute({ recoveryCode: validPlain, username: 'admin' });

    const remaining = await repo.countUnconsumed();
    expect(remaining).toBe(0);
  });

  it('records an audit event on success', async () => {
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

    await useCase.execute({ recoveryCode: validPlain, username: 'admin' });

    const events = auditLog.list();
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('recovery-code-consumed');
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

  it('throws InvalidRecoveryCodeError when code is already consumed (but other codes remain)', async () => {
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
});
