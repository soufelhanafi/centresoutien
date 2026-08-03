import { describe, it, expect, beforeEach } from 'vitest';
import { ResetPasswordWithRecoveryCode } from '../../../src/use-cases/reset-password-with-recovery-code';
import { VerifyRecoveryCode } from '../../../src/use-cases/verify-recovery-code';
import { InMemoryRecoveryCodeRepository } from '../fakes/in-memory-recovery-code-repository';
import { InMemoryAuthAuditLogRepository } from '../fakes/in-memory-auth-audit-log-repository';
import { InMemoryAdminAccountRepository } from '../fakes/in-memory-admin-account-repository';
import { InMemoryLoginThrottleStore } from '../fakes/in-memory-login-throttle-store';
import { LoginThrottlePolicy } from '../../../src/policies/login-throttle-policy';
import { fakeHasher } from '../fakes/hasher';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import { InvalidRecoveryCodeError, AdminAccountNotFoundError } from '../../../src/errors/auth-errors';
import type { AdminAccountId } from '../../../src/entities/admin-account';
import type { RecoveryCodeId } from '../../../src/entities/recovery-code';

function validCode() {
  return 'AABB-CCDD-EEFF-0011';
}

describe('ResetPasswordWithRecoveryCode', () => {
  let accounts: InMemoryAdminAccountRepository;
  let codes: InMemoryRecoveryCodeRepository;
  let auditLog: InMemoryAuthAuditLogRepository;
  let useCase: ResetPasswordWithRecoveryCode;
  const hasher = fakeHasher();
  const clock = fakeClock('2026-08-03T10:00:00Z');

  beforeEach(async () => {
    accounts = new InMemoryAdminAccountRepository();
    codes = new InMemoryRecoveryCodeRepository();
    auditLog = new InMemoryAuthAuditLogRepository();

    accounts.save({
      id: 'adm_1' as AdminAccountId,
      username: 'admin',
      passwordHash: await hasher.hash('oldPass1'),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const verify = new VerifyRecoveryCode(
      codes,
      auditLog,
      hasher,
      new InMemoryLoginThrottleStore(),
      new LoginThrottlePolicy(),
      clock,
      fakeIds(),
    );
    useCase = new ResetPasswordWithRecoveryCode(verify, accounts, auditLog, hasher, clock, fakeIds());

    const hashed = await hasher.hash(validCode());
    await codes.saveMany([
      {
        id: 'rec_1' as RecoveryCodeId,
        codeHash: hashed,
        consumed: false,
        createdAt: new Date(),
        consumedAt: null,
      },
    ]);
  });

  it('resets the password with a valid recovery code', async () => {
    await useCase.execute({
      recoveryCode: validCode(),
      newPassword: 'NewPass1',
      username: 'admin',
    });

    const account = await accounts.findOnly();
    expect(account).not.toBeNull();
    const verified = await hasher.verify(account!.passwordHash, 'NewPass1');
    expect(verified).toBe(true);

    const remaining = await codes.countUnconsumed();
    expect(remaining).toBe(0);
  });

  it('records a password-reset audit event', async () => {
    await useCase.execute({
      recoveryCode: validCode(),
      newPassword: 'NewPass1',
      username: 'admin',
    });

    const events = auditLog.list();
    const resetEvents = events.filter((e) => e.eventType === 'password-reset-via-recovery-code');
    expect(resetEvents).toHaveLength(1);
    expect(resetEvents[0].username).toBe('admin');
  });

  it('throws InvalidRecoveryCodeError for a wrong code', async () => {
    await expect(
      useCase.execute({
        recoveryCode: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
        newPassword: 'NewPass1',
        username: 'admin',
      }),
    ).rejects.toBeInstanceOf(InvalidRecoveryCodeError);
  });

  it('does not consume a code when the account is missing', async () => {
    accounts = new InMemoryAdminAccountRepository();
    const verify = new VerifyRecoveryCode(
      codes,
      auditLog,
      hasher,
      new InMemoryLoginThrottleStore(),
      new LoginThrottlePolicy(),
      clock,
      fakeIds(),
    );
    useCase = new ResetPasswordWithRecoveryCode(verify, accounts, auditLog, hasher, clock, fakeIds());

    await expect(
      useCase.execute({
        recoveryCode: validCode(),
        newPassword: 'NewPass1',
        username: 'admin',
      }),
    ).rejects.toBeInstanceOf(AdminAccountNotFoundError);

    const remaining = await codes.countUnconsumed();
    expect(remaining).toBe(1);
  });

  it('throws on weak password', async () => {
    await expect(
      useCase.execute({
        recoveryCode: validCode(),
        newPassword: 'short',
        username: 'admin',
      }),
    ).rejects.toThrow();
  });
});
