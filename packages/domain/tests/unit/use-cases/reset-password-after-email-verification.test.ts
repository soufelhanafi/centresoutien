import { describe, it, expect, beforeEach } from 'vitest';
import { ResetPasswordAfterEmailVerification } from '../../../src/use-cases/reset-password-after-email-verification';
import { InMemoryAuthAuditLogRepository } from '../fakes/in-memory-auth-audit-log-repository';
import { InMemoryAdminAccountRepository } from '../fakes/in-memory-admin-account-repository';
import { InMemoryDeviceSessionStore } from '../fakes/in-memory-device-session-store';
import { InMemoryEmailPasswordResetUnitOfWork } from '../fakes/in-memory-email-password-reset-unit-of-work';
import type { DeviceSessionId } from '../../../src/entities/device-session';
import { fakeHasher } from '../fakes/hasher';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import { AdminAccountNotFoundError } from '../../../src/errors/auth-errors';
import type { AdminAccountId } from '../../../src/entities/admin-account';

describe('ResetPasswordAfterEmailVerification', () => {
  let accounts: InMemoryAdminAccountRepository;
  let auditLog: InMemoryAuthAuditLogRepository;
  let deviceSessionStore: InMemoryDeviceSessionStore;
  let resetUnitOfWork: InMemoryEmailPasswordResetUnitOfWork;
  let useCase: ResetPasswordAfterEmailVerification;
  const hasher = fakeHasher();
  const clock = fakeClock('2026-08-23T10:00:00Z');

  beforeEach(async () => {
    accounts = new InMemoryAdminAccountRepository();
    auditLog = new InMemoryAuthAuditLogRepository();
    deviceSessionStore = new InMemoryDeviceSessionStore();

    accounts.save({
      id: 'adm_1' as AdminAccountId,
      username: 'admin',
      passwordHash: await hasher.hash('oldPass1'),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    resetUnitOfWork = new InMemoryEmailPasswordResetUnitOfWork(
      accounts,
      auditLog,
      deviceSessionStore,
    );
    useCase = new ResetPasswordAfterEmailVerification(
      accounts,
      resetUnitOfWork,
      hasher,
      clock,
      fakeIds(),
    );
  });

  it('rotates the password to the new value', async () => {
    const result = await useCase.execute({ newPassword: 'NewPass1', username: 'admin' });
    expect(result.outcome).toBe('success');

    const account = await accounts.findOnly();
    expect(account).not.toBeNull();
    expect(await hasher.verify(account!.passwordHash, 'NewPass1')).toBe(true);
    expect(await hasher.verify(account!.passwordHash, 'oldPass1')).toBe(false);
    expect(account!.updatedAt).toEqual(clock.now());
    expect(resetUnitOfWork.commits).toBe(1);
  });

  it('records the password-reset-via-email audit event', async () => {
    await useCase.execute({ newPassword: 'NewPass1', username: 'admin' });

    const events = auditLog.list();
    expect(events.some((e) => e.eventType === 'password-reset-via-email')).toBe(true);
    expect(events.every((e) => e.eventType !== 'password-reset-via-recovery-code')).toBe(true);
  });

  it('invalidates the remembered device session on a successful reset', async () => {
    await deviceSessionStore.save({
      id: 'ses_1' as DeviceSessionId,
      createdAt: clock.now().getTime(),
      expiresAt: clock.now().getTime() + 1_000_000,
      userId: null,
    });

    await useCase.execute({ newPassword: 'NewPass1', username: 'admin' });

    expect(deviceSessionStore.clearCount).toBe(1);
    expect(await deviceSessionStore.getCurrent()).toBeNull();
  });

  it('records a device-session-invalidated event when a session was cleared', async () => {
    await deviceSessionStore.save({
      id: 'ses_1' as DeviceSessionId,
      createdAt: clock.now().getTime(),
      expiresAt: clock.now().getTime() + 1_000_000,
      userId: null,
    });

    await useCase.execute({ newPassword: 'NewPass1', username: 'admin' });

    const events = auditLog.list();
    expect(events.some((e) => e.eventType === 'device-session-invalidated-after-reset')).toBe(true);
  });

  it('does not record a device-session-invalidated event when no session was remembered', async () => {
    await useCase.execute({ newPassword: 'NewPass1', username: 'admin' });

    const events = auditLog.list();
    expect(events.some((e) => e.eventType === 'device-session-invalidated-after-reset')).toBe(false);
    expect(events.some((e) => e.eventType === 'password-reset-via-email')).toBe(true);
  });

  it('throws AdminAccountNotFoundError and does not commit when the account is missing', async () => {
    accounts = new InMemoryAdminAccountRepository();
    resetUnitOfWork = new InMemoryEmailPasswordResetUnitOfWork(
      accounts,
      auditLog,
      deviceSessionStore,
    );
    useCase = new ResetPasswordAfterEmailVerification(
      accounts,
      resetUnitOfWork,
      hasher,
      clock,
      fakeIds(),
    );

    await expect(
      useCase.execute({ newPassword: 'NewPass1', username: 'admin' }),
    ).rejects.toBeInstanceOf(AdminAccountNotFoundError);
    expect(resetUnitOfWork.commits).toBe(0);
  });

  it('rolls the whole reset back when the atomic commit fails (no partial state)', async () => {
    await deviceSessionStore.save({
      id: 'ses_1' as DeviceSessionId,
      createdAt: clock.now().getTime(),
      expiresAt: clock.now().getTime() + 1_000_000,
      userId: null,
    });

    const failingUnitOfWork = new InMemoryEmailPasswordResetUnitOfWork(
      accounts,
      auditLog,
      deviceSessionStore,
      true,
    );
    const failingUseCase = new ResetPasswordAfterEmailVerification(
      accounts,
      failingUnitOfWork,
      hasher,
      clock,
      fakeIds(),
    );

    await expect(
      failingUseCase.execute({ newPassword: 'NewPass1', username: 'admin' }),
    ).rejects.toThrow();

    const account = await accounts.findOnly();
    expect(await hasher.verify(account!.passwordHash, 'oldPass1')).toBe(true);
    expect(await hasher.verify(account!.passwordHash, 'NewPass1')).toBe(false);

    const events = auditLog.list();
    expect(events.some((e) => e.eventType === 'password-reset-via-email')).toBe(false);
    expect(events.some((e) => e.eventType === 'device-session-invalidated-after-reset')).toBe(false);
    expect(await deviceSessionStore.getCurrent()).not.toBeNull();
    expect(deviceSessionStore.clearCount).toBe(0);
  });

  it('throws on a weak password without touching the account or committing', async () => {
    await expect(
      useCase.execute({ newPassword: 'short', username: 'admin' }),
    ).rejects.toThrow();

    const account = await accounts.findOnly();
    expect(await hasher.verify(account!.passwordHash, 'oldPass1')).toBe(true);
    expect(resetUnitOfWork.commits).toBe(0);
  });
});
