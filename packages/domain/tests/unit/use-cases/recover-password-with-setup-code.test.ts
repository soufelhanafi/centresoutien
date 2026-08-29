import { describe, it, expect, beforeEach } from 'vitest';
import { CreateUser } from '../../../src/use-cases/create-user';
import { ReissueSetupCode } from '../../../src/use-cases/reissue-setup-code';
import { RecoverPasswordWithSetupCode } from '../../../src/use-cases/recover-password-with-setup-code';
import { VerifyUserPassword } from '../../../src/use-cases/verify-user-password';
import { SETUP_CODE_TTL_MS } from '../../../src/entities/user';
import { SetupCodeInvalidError, SetupCodeExpiredError } from '../../../src/errors/user-errors';
import { InMemoryUserRepository } from '../fakes/in-memory-user-repository';
import { InMemoryAuthAuditLogRepository } from '../fakes/in-memory-auth-audit-log-repository';
import { InMemoryDeviceSessionStore } from '../fakes/in-memory-device-session-store';
import { InMemorySetupCodeRecoveryUnitOfWork } from '../fakes/in-memory-setup-code-recovery-unit-of-work';
import { seedPendingInvite } from '../fakes/pending-invite';
import { fakeHasher } from '../fakes/hasher';
import { fakeSecureRandom } from '../fakes/secure-random';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import type { DeviceSessionId } from '../../../src/entities/device-session';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';

const NOW = '2026-07-29T10:00:00Z';
const OLD_PASSWORD = ['Rabat', '2027', '?'].join('');
const NEW_PASSWORD = ['Casablanca', '2028', '!'].join('');
const CONTEXT = {
  centerCode: 'CS-CASA-001' as CenterCode,
  deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
  updatedBy: 'usr_00000000000000000000000001' as UserId,
};

/** Seed a pending un-onboarded invite and return its plaintext code. */
async function invite(clock: ReturnType<typeof fakeClock>, users: InMemoryUserRepository) {
  const setupCode = 'A7K2-9FMP-3QRT';
  await seedPendingInvite(users, clock, CONTEXT, setupCode);
  return { setupCode };
}

/** Create an active staff account (director-set credentials), then have the
 *  director re-issue a fresh recovery code against it. */
async function onboardThenReissue(clock: ReturnType<typeof fakeClock>, users: InMemoryUserRepository) {
  const { user } = await new CreateUser(users, fakeHasher(), clock, fakeIds()).execute({
    role: 'secretary',
    username: 'secretaire',
    password: OLD_PASSWORD,
    fullName: 'Fatima Zahra',
    ...CONTEXT,
  });
  const { setupCode: fresh } = await new ReissueSetupCode(
    users,
    fakeHasher(),
    fakeSecureRandom(),
    clock,
  ).execute({ userId: user.id, updatedBy: CONTEXT.updatedBy });
  return { userId: user.id, fresh };
}

describe('RecoverPasswordWithSetupCode', () => {
  let users: InMemoryUserRepository;
  let auditLog: InMemoryAuthAuditLogRepository;
  let deviceSessions: InMemoryDeviceSessionStore;
  let unitOfWork: InMemorySetupCodeRecoveryUnitOfWork;
  let clock: ReturnType<typeof fakeClock>;
  let recover: RecoverPasswordWithSetupCode;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    auditLog = new InMemoryAuthAuditLogRepository();
    deviceSessions = new InMemoryDeviceSessionStore();
    unitOfWork = new InMemorySetupCodeRecoveryUnitOfWork(users, auditLog, deviceSessions);
    clock = fakeClock(NOW);
    recover = new RecoverPasswordWithSetupCode(users, fakeHasher(), clock, fakeIds(), unitOfWork);
  });

  it('rotates the password of an already-onboarded account via a re-issued code', async () => {
    const { userId, fresh } = await onboardThenReissue(clock, users);

    await recover.execute({ setupCode: fresh, newPassword: NEW_PASSWORD });

    const verify = new VerifyUserPassword(users, fakeHasher());
    await expect(
      verify.execute({ username: 'secretaire', password: NEW_PASSWORD }),
    ).resolves.toMatchObject({ username: 'secretaire' });
    const stored = await users.findById(userId);
    expect(stored?.setupCodeHash).toBeNull();
    expect(stored?.setupCodeRedeemedAt).not.toBeNull();
    // Identity is untouched by a recovery.
    expect(stored?.fullName).toBe('Fatima Zahra');
    expect(stored?.email).toBeNull();
    expect(unitOfWork.commits).toBe(1);
  });

  it('records a password-reset-via-setup-code audit event', async () => {
    const { fresh } = await onboardThenReissue(clock, users);
    await recover.execute({ setupCode: fresh, newPassword: NEW_PASSWORD });
    expect(auditLog.list().some((e) => e.eventType === 'password-reset-via-setup-code')).toBe(true);
  });

  it('invalidates the remembered device session on a successful recovery', async () => {
    const { fresh } = await onboardThenReissue(clock, users);
    await deviceSessions.save({
      id: 'ses_1' as DeviceSessionId,
      createdAt: clock.now().getTime(),
      expiresAt: clock.now().getTime() + 1_000_000,
      userId: null,
    });

    await recover.execute({ setupCode: fresh, newPassword: NEW_PASSWORD });

    expect(deviceSessions.clearCount).toBe(1);
    expect(await deviceSessions.getCurrent()).toBeNull();
    expect(
      auditLog.list().some((e) => e.eventType === 'device-session-invalidated-after-reset'),
    ).toBe(true);
  });

  it('does not log a session-invalidated event when no session was remembered', async () => {
    const { fresh } = await onboardThenReissue(clock, users);
    await recover.execute({ setupCode: fresh, newPassword: NEW_PASSWORD });
    expect(
      auditLog.list().some((e) => e.eventType === 'device-session-invalidated-after-reset'),
    ).toBe(false);
  });

  it('rejects a code for an un-onboarded invite — that is the first-login flow', async () => {
    const { setupCode } = await invite(clock, users);
    await expect(
      recover.execute({ setupCode, newPassword: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(SetupCodeInvalidError);
    expect(unitOfWork.commits).toBe(0);
  });

  it('rejects a wrong code', async () => {
    await invite(clock, users);
    await expect(
      recover.execute({ setupCode: 'ZZZZ-ZZZZ-ZZZZ', newPassword: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(SetupCodeInvalidError);
  });

  it('rejects an expired re-issued code', async () => {
    const { fresh } = await onboardThenReissue(clock, users);
    clock.advance(SETUP_CODE_TTL_MS + 1);
    await expect(
      recover.execute({ setupCode: fresh, newPassword: NEW_PASSWORD }),
    ).rejects.toBeInstanceOf(SetupCodeExpiredError);
  });
});
