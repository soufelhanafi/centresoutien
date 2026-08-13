import { describe, it, expect, beforeEach } from 'vitest';
import { ResetPasswordWithRecoveryCode } from '../../../src/use-cases/reset-password-with-recovery-code';
import { VerifyRecoveryCode } from '../../../src/use-cases/verify-recovery-code';
import { InMemoryRecoveryCodeRepository } from '../fakes/in-memory-recovery-code-repository';
import { InMemoryAuthAuditLogRepository } from '../fakes/in-memory-auth-audit-log-repository';
import { InMemoryAdminAccountRepository } from '../fakes/in-memory-admin-account-repository';
import { InMemoryLoginThrottleStore } from '../fakes/in-memory-login-throttle-store';
import { InMemoryDeviceSessionStore } from '../fakes/in-memory-device-session-store';
import { InMemoryRecoveryCodeResetUnitOfWork } from '../fakes/in-memory-recovery-code-reset-unit-of-work';
import { DeviceSessionService } from '../../../src/services/device-session-service';
import type { DeviceSessionId } from '../../../src/entities/device-session';
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
  let deviceSessionStore: InMemoryDeviceSessionStore;
  let useCase: ResetPasswordWithRecoveryCode;
  const hasher = fakeHasher();
  const clock = fakeClock('2026-08-03T10:00:00Z');

  beforeEach(async () => {
    accounts = new InMemoryAdminAccountRepository();
    codes = new InMemoryRecoveryCodeRepository();
    auditLog = new InMemoryAuthAuditLogRepository();
    deviceSessionStore = new InMemoryDeviceSessionStore();

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
    const resetUnitOfWork = new InMemoryRecoveryCodeResetUnitOfWork(
      accounts,
      codes,
      auditLog,
      deviceSessionStore,
    );
    useCase = new ResetPasswordWithRecoveryCode(
      verify,
      accounts,
      resetUnitOfWork,
      hasher,
      new DeviceSessionService(deviceSessionStore, clock, fakeIds()),
      clock,
      fakeIds(),
    );

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
    const result = await useCase.execute({
      recoveryCode: validCode(),
      newPassword: 'NewPass1',
      username: 'admin',
    });
    expect(result.outcome).toBe('success');

    const account = await accounts.findOnly();
    expect(account).not.toBeNull();
    const verified = await hasher.verify(account!.passwordHash, 'NewPass1');
    expect(verified).toBe(true);

    const remaining = await codes.countUnconsumed();
    expect(remaining).toBe(0);
  });

  it('records both consume and password-reset audit events', async () => {
    await useCase.execute({
      recoveryCode: validCode(),
      newPassword: 'NewPass1',
      username: 'admin',
    });

    const events = auditLog.list();
    expect(events.some((e) => e.eventType === 'recovery-code-consumed')).toBe(true);
    expect(events.some((e) => e.eventType === 'password-reset-via-recovery-code')).toBe(true);
  });

  it('invalidates the remembered device session on a successful reset', async () => {
    await deviceSessionStore.save({
      id: 'ses_1' as DeviceSessionId,
      createdAt: clock.now().getTime(),
      expiresAt: clock.now().getTime() + 1_000_000,
    });

    await useCase.execute({
      recoveryCode: validCode(),
      newPassword: 'NewPass1',
      username: 'admin',
    });

    expect(deviceSessionStore.clearCount).toBe(1);
    expect(await deviceSessionStore.getCurrent()).toBeNull();
  });

  it('records a device-session-invalidated audit event when a session was cleared', async () => {
    await deviceSessionStore.save({
      id: 'ses_1' as DeviceSessionId,
      createdAt: clock.now().getTime(),
      expiresAt: clock.now().getTime() + 1_000_000,
    });

    await useCase.execute({
      recoveryCode: validCode(),
      newPassword: 'NewPass1',
      username: 'admin',
    });

    const events = auditLog.list();
    expect(events.some((e) => e.eventType === 'device-session-invalidated-after-reset')).toBe(true);
  });

  it('does not record a device-session-invalidated event when no session was remembered', async () => {
    await useCase.execute({
      recoveryCode: validCode(),
      newPassword: 'NewPass1',
      username: 'admin',
    });

    const events = auditLog.list();
    expect(events.some((e) => e.eventType === 'device-session-invalidated-after-reset')).toBe(false);
    expect(events.some((e) => e.eventType === 'password-reset-via-recovery-code')).toBe(true);
  });

  it('does not clear the device session when the code is invalid', async () => {
    await deviceSessionStore.save({
      id: 'ses_1' as DeviceSessionId,
      createdAt: clock.now().getTime(),
      expiresAt: clock.now().getTime() + 1_000_000,
    });

    await expect(
      useCase.execute({
        recoveryCode: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
        newPassword: 'NewPass1',
        username: 'admin',
      }),
    ).rejects.toBeInstanceOf(InvalidRecoveryCodeError);

    expect(deviceSessionStore.clearCount).toBe(0);
    expect(await deviceSessionStore.getCurrent()).not.toBeNull();
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
    useCase = new ResetPasswordWithRecoveryCode(
      verify,
      accounts,
      new InMemoryRecoveryCodeResetUnitOfWork(accounts, codes, auditLog, deviceSessionStore),
      hasher,
      new DeviceSessionService(deviceSessionStore, clock, fakeIds()),
      clock,
      fakeIds(),
    );

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

  it('does not consume a code when password save would fail (bad code)', async () => {
    await expect(
      useCase.execute({
        recoveryCode: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ',
        newPassword: 'NewPass1',
        username: 'admin',
      }),
    ).rejects.toBeInstanceOf(InvalidRecoveryCodeError);

    const remaining = await codes.countUnconsumed();
    expect(remaining).toBe(1);
  });

  it('rolls the whole reset back when the atomic commit fails (no partial state)', async () => {
    await deviceSessionStore.save({
      id: 'ses_1' as DeviceSessionId,
      createdAt: clock.now().getTime(),
      expiresAt: clock.now().getTime() + 1_000_000,
    });

    const failingUnitOfWork = new InMemoryRecoveryCodeResetUnitOfWork(
      accounts,
      codes,
      auditLog,
      deviceSessionStore,
      true,
    );
    const failingUseCase = new ResetPasswordWithRecoveryCode(
      new VerifyRecoveryCode(
        codes,
        auditLog,
        hasher,
        new InMemoryLoginThrottleStore(),
        new LoginThrottlePolicy(),
        clock,
        fakeIds(),
      ),
      accounts,
      failingUnitOfWork,
      hasher,
      new DeviceSessionService(deviceSessionStore, clock, fakeIds()),
      clock,
      fakeIds(),
    );

    await expect(
      failingUseCase.execute({
        recoveryCode: validCode(),
        newPassword: 'NewPass1',
        username: 'admin',
      }),
    ).rejects.toThrow();

    const account = await accounts.findOnly();
    expect(await hasher.verify(account!.passwordHash, 'oldPass1')).toBe(true);
    expect(await hasher.verify(account!.passwordHash, 'NewPass1')).toBe(false);
    expect(await codes.countUnconsumed()).toBe(1);

    const events = auditLog.list();
    expect(events.some((e) => e.eventType === 'recovery-code-consumed')).toBe(false);
    expect(events.some((e) => e.eventType === 'password-reset-via-recovery-code')).toBe(false);
    expect(events.some((e) => e.eventType === 'device-session-invalidated-after-reset')).toBe(false);

    expect(await deviceSessionStore.getCurrent()).not.toBeNull();
    expect(deviceSessionStore.clearCount).toBe(0);
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
