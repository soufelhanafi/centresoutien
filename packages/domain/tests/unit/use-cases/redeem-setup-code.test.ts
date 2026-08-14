import { describe, it, expect, beforeEach } from 'vitest';
import { CreateUser } from '../../../src/use-cases/create-user';
import { RedeemSetupCode } from '../../../src/use-cases/redeem-setup-code';
import { VerifyUserPassword } from '../../../src/use-cases/verify-user-password';
import { SETUP_CODE_TTL_MS } from '../../../src/entities/user';
import {
  UserNotFoundError,
  SetupCodeInvalidError,
  SetupCodeExpiredError,
  SetupCodeAlreadyRedeemedError,
} from '../../../src/errors/user-errors';
import { InMemoryUserRepository } from '../fakes/in-memory-user-repository';
import { fakeHasher } from '../fakes/hasher';
import { fakeSecureRandom } from '../fakes/secure-random';
import { fakeClock } from '../fakes/clock';
import { fakeIds } from '../fakes/ids';
import type { CenterCode, DeviceId, UserId } from '../../../src/value-objects/ids';

const NOW = '2026-07-29T10:00:00Z';
const NEW_PASSWORD = ['Rabat', '2027', '?'].join('');

const CONTEXT = {
  centerCode: 'CS-CASA-001' as CenterCode,
  deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
  updatedBy: 'usr_00000000000000000000000001' as UserId,
};

/** Invite an employee and return the plaintext setup code, sharing one clock. */
async function invite(clock: ReturnType<typeof fakeClock>, users: InMemoryUserRepository) {
  const { user, setupCode } = await new CreateUser(
    users,
    fakeHasher(),
    fakeSecureRandom(),
    clock,
    fakeIds(),
  ).execute({ username: 'secretaire', role: 'secretary', ...CONTEXT });
  return { user, setupCode };
}

describe('RedeemSetupCode', () => {
  let users: InMemoryUserRepository;
  let clock: ReturnType<typeof fakeClock>;
  let redeem: RedeemSetupCode;
  let setupCode: string;

  beforeEach(async () => {
    users = new InMemoryUserRepository();
    clock = fakeClock(NOW);
    redeem = new RedeemSetupCode(users, fakeHasher(), clock);
    ({ setupCode } = await invite(clock, users));
  });

  describe('happy path', () => {
    it('sets the password, clears the pending code, and stamps the redemption', async () => {
      await redeem.execute({ username: 'secretaire', setupCode, newPassword: NEW_PASSWORD });

      const user = await users.findByUsername('secretaire');
      expect(user?.passwordHash).toBe(`hashed:${NEW_PASSWORD}`);
      expect(user?.setupCodeHash).toBeNull();
      expect(user?.setupCodeRedeemedAt).toEqual(new Date(NOW));
    });

    it('lets the employee log in afterwards', async () => {
      await redeem.execute({ username: 'secretaire', setupCode, newPassword: NEW_PASSWORD });
      const verify = new VerifyUserPassword(users, fakeHasher());
      const identity = await verify.execute({ username: 'secretaire', password: NEW_PASSWORD });
      expect(identity).toMatchObject({ username: 'secretaire', role: 'secretary' });
    });
  });

  describe('single-use', () => {
    it('rejects a second redemption of the same code', async () => {
      await redeem.execute({ username: 'secretaire', setupCode, newPassword: NEW_PASSWORD });
      await expect(
        redeem.execute({ username: 'secretaire', setupCode, newPassword: NEW_PASSWORD }),
      ).rejects.toBeInstanceOf(SetupCodeAlreadyRedeemedError);
    });
  });

  describe('expiry', () => {
    it('rejects a code presented after its expiry window', async () => {
      clock.advance(SETUP_CODE_TTL_MS + 1);
      await expect(
        redeem.execute({ username: 'secretaire', setupCode, newPassword: NEW_PASSWORD }),
      ).rejects.toBeInstanceOf(SetupCodeExpiredError);
    });
  });

  describe('invalid input', () => {
    it('rejects a wrong code without revealing whether an invite exists', async () => {
      await expect(
        redeem.execute({ username: 'secretaire', setupCode: 'ZZZZ-ZZZZ-ZZZZ', newPassword: NEW_PASSWORD }),
      ).rejects.toBeInstanceOf(SetupCodeInvalidError);
    });

    it('rejects an unknown username', async () => {
      await expect(
        redeem.execute({ username: 'ghost', setupCode, newPassword: NEW_PASSWORD }),
      ).rejects.toBeInstanceOf(UserNotFoundError);
    });

    it('rejects a weak new password', async () => {
      await expect(
        redeem.execute({ username: 'secretaire', setupCode, newPassword: 'weak' }),
      ).rejects.toThrow();
    });
  });
});
