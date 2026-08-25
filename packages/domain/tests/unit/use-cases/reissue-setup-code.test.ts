import { describe, it, expect, beforeEach } from 'vitest';
import { CreateUser } from '../../../src/use-cases/create-user';
import { RedeemSetupCode } from '../../../src/use-cases/redeem-setup-code';
import { ReissueSetupCode } from '../../../src/use-cases/reissue-setup-code';
import { CreateAdminAccount } from '../../../src/use-cases/create-admin-account';
import { SETUP_CODE_TTL_MS } from '../../../src/entities/user';
import { UserNotFoundError, RoleNotInvitableError } from '../../../src/errors/user-errors';
import { InMemoryUserRepository } from '../fakes/in-memory-user-repository';
import { fakeHasher } from '../fakes/hasher';
import { fakeSecureRandom } from '../fakes/secure-random';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';

const NOW = '2026-07-29T10:00:00Z';
const DIRECTOR = 'usr_00000000000000000000000009' as UserId;
const CONTEXT = {
  centerCode: 'CS-CASA-001' as CenterCode,
  deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
  updatedBy: 'usr_00000000000000000000000001' as UserId,
};

// Onboard a secretary (invite -> redeem) so it has a password + identity, then
// return its stored row.
async function onboardedSecretary(clock: ReturnType<typeof fakeClock>, users: InMemoryUserRepository) {
  const { user, setupCode } = await new CreateUser(
    users,
    fakeHasher(),
    fakeSecureRandom(),
    clock,
    fakeIds(),
  ).execute({ role: 'secretary', ...CONTEXT });
  await new RedeemSetupCode(users, fakeHasher(), clock).execute({
    setupCode,
    username: 'secretaire',
    fullName: 'Fatima Zahra',
    email: 'fatima@centre.ma',
    newPassword: ['Rabat', '2027', '?'].join(''),
  });
  return (await users.findById(user.id))!;
}

describe('ReissueSetupCode', () => {
  let users: InMemoryUserRepository;
  let clock: ReturnType<typeof fakeClock>;
  let reissue: ReissueSetupCode;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    clock = fakeClock(NOW);
    reissue = new ReissueSetupCode(users, fakeHasher(), fakeSecureRandom(), clock);
  });

  it('re-opens a fresh code while preserving id, identity, and password', async () => {
    const before = await onboardedSecretary(clock, users);
    clock.advance(60_000);

    const { user, setupCode } = await reissue.execute({ userId: before.id, updatedBy: DIRECTOR });

    expect(user.id).toBe(before.id); // userId preserved -> audit trail intact
    expect(user.username).toBe('secretaire');
    expect(user.fullName).toBe('Fatima Zahra');
    expect(user.email).toBe('fatima@centre.ma');
    expect(user.passwordHash).toBe(before.passwordHash); // old password still valid until redeemed
    expect(user.setupCodeHash).toBe(`hashed:${setupCode}`);
    expect(user.setupCodeExpiresAt).toBe(clock.now().getTime() + SETUP_CODE_TTL_MS);
    expect(user.setupCodeRedeemedAt).toBeNull(); // re-opened
    expect(user.updatedBy).toBe(DIRECTOR);
  });

  it('rejects re-issuing a code for the owner (recovers via their own email path)', async () => {
    const owner = await new CreateAdminAccount(users, fakeHasher(), clock, fakeIds(), CONTEXT).execute({
      username: 'directrice',
      password: ['Casa', '2026', '!'].join(''),
    });
    await expect(reissue.execute({ userId: owner.id, updatedBy: DIRECTOR })).rejects.toBeInstanceOf(
      RoleNotInvitableError,
    );
  });

  it('rejects an unknown user', async () => {
    await expect(
      reissue.execute({ userId: 'usr_00000000000000000000000404' as UserId, updatedBy: DIRECTOR }),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });
});
