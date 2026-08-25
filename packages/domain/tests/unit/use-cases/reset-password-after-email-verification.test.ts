import { describe, it, expect, beforeEach } from 'vitest';
import { ResetPasswordAfterEmailVerification } from '../../../src/use-cases/reset-password-after-email-verification';
import { InMemoryAuthAuditLogRepository } from '../fakes/in-memory-auth-audit-log-repository';
import { InMemoryUserRepository } from '../fakes/in-memory-user-repository';
import { InMemoryDeviceSessionStore } from '../fakes/in-memory-device-session-store';
import { InMemoryEmailPasswordResetUnitOfWork } from '../fakes/in-memory-email-password-reset-unit-of-work';
import type { DeviceSessionId } from '../../../src/entities/device-session';
import type { User, UserId } from '../../../src/entities/user';
import type { CenterCode, DeviceId } from '../../../src/value-objects/ids';
import { fakeHasher } from '../fakes/hasher';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import { UserNotFoundError } from '../../../src/errors/user-errors';

const AT = new Date('2026-08-23T10:00:00Z');

async function seedStaff(users: InMemoryUserRepository, passwordHash: string): Promise<User> {
  const user: User = {
    id: 'usr_00000000000000000000000007' as UserId,
    centerCode: 'CS-CASA-001' as CenterCode,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: 'usr_00000000000000000000000007' as UserId,
    deletedAt: null,
    version: 0,
    role: 'secretary',
    username: 'sanaa',
    fullName: 'Sanaa Bennani',
    passwordHash,
    setupCodeHash: null,
    setupCodeExpiresAt: null,
    setupCodeRedeemedAt: AT,
    email: 'sanaa@centre.ma' as User['email'],
  };
  await users.save(user);
  return user;
}

describe('ResetPasswordAfterEmailVerification (per-user, SOU-303)', () => {
  let users: InMemoryUserRepository;
  let auditLog: InMemoryAuthAuditLogRepository;
  let deviceSessionStore: InMemoryDeviceSessionStore;
  let resetUnitOfWork: InMemoryEmailPasswordResetUnitOfWork;
  let useCase: ResetPasswordAfterEmailVerification;
  const hasher = fakeHasher();
  const clock = fakeClock('2026-08-23T10:00:00Z');

  beforeEach(async () => {
    users = new InMemoryUserRepository();
    auditLog = new InMemoryAuthAuditLogRepository();
    deviceSessionStore = new InMemoryDeviceSessionStore();
    await seedStaff(users, await hasher.hash('oldPass1'));

    resetUnitOfWork = new InMemoryEmailPasswordResetUnitOfWork(users, auditLog, deviceSessionStore);
    useCase = new ResetPasswordAfterEmailVerification(users, resetUnitOfWork, hasher, clock, fakeIds());
  });

  it('rotates the resolved staff account password to the new value', async () => {
    const result = await useCase.execute({ newPassword: 'NewPass1', username: 'sanaa' });
    expect(result.outcome).toBe('success');

    const account = await users.findByUsername('sanaa');
    expect(await hasher.verify(account!.passwordHash!, 'NewPass1')).toBe(true);
    expect(await hasher.verify(account!.passwordHash!, 'oldPass1')).toBe(false);
    expect(account!.updatedAt).toEqual(clock.now());
    expect(resetUnitOfWork.commits).toBe(1);
  });

  it('resolves by username, case-insensitively', async () => {
    await useCase.execute({ newPassword: 'NewPass1', username: '  SANAA ' });
    const account = await users.findByUsername('sanaa');
    expect(await hasher.verify(account!.passwordHash!, 'NewPass1')).toBe(true);
  });

  it('records the password-reset-via-email audit event', async () => {
    await useCase.execute({ newPassword: 'NewPass1', username: 'sanaa' });
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

    await useCase.execute({ newPassword: 'NewPass1', username: 'sanaa' });

    expect(deviceSessionStore.clearCount).toBe(1);
    expect(await deviceSessionStore.getCurrent()).toBeNull();
    expect(auditLog.list().some((e) => e.eventType === 'device-session-invalidated-after-reset')).toBe(
      true,
    );
  });

  it('does not record a device-session-invalidated event when no session was remembered', async () => {
    await useCase.execute({ newPassword: 'NewPass1', username: 'sanaa' });
    const events = auditLog.list();
    expect(events.some((e) => e.eventType === 'device-session-invalidated-after-reset')).toBe(false);
    expect(events.some((e) => e.eventType === 'password-reset-via-email')).toBe(true);
  });

  it('throws UserNotFoundError and does not commit when no account matches the username', async () => {
    await expect(
      useCase.execute({ newPassword: 'NewPass1', username: 'ghost' }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
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
      users,
      auditLog,
      deviceSessionStore,
      true,
    );
    const failingUseCase = new ResetPasswordAfterEmailVerification(
      users,
      failingUnitOfWork,
      hasher,
      clock,
      fakeIds(),
    );

    await expect(
      failingUseCase.execute({ newPassword: 'NewPass1', username: 'sanaa' }),
    ).rejects.toThrow();

    const account = await users.findByUsername('sanaa');
    expect(await hasher.verify(account!.passwordHash!, 'oldPass1')).toBe(true);
    expect(await hasher.verify(account!.passwordHash!, 'NewPass1')).toBe(false);
    expect(auditLog.list().some((e) => e.eventType === 'password-reset-via-email')).toBe(false);
    expect(await deviceSessionStore.getCurrent()).not.toBeNull();
    expect(deviceSessionStore.clearCount).toBe(0);
  });

  it('throws on a weak password without touching the account or committing', async () => {
    await expect(
      useCase.execute({ newPassword: 'short', username: 'sanaa' }),
    ).rejects.toThrow();
    const account = await users.findByUsername('sanaa');
    expect(await hasher.verify(account!.passwordHash!, 'oldPass1')).toBe(true);
    expect(resetUnitOfWork.commits).toBe(0);
  });
});
