import { describe, it, expect, beforeEach } from 'vitest';
import { CreateUser } from '../../../src/use-cases/create-user';
import { RedeemSetupCode } from '../../../src/use-cases/redeem-setup-code';
import { VerifyUserPassword } from '../../../src/use-cases/verify-user-password';
import { SETUP_CODE_TTL_MS } from '../../../src/entities/user';
import {
  UsernameAlreadyTakenError,
  SetupCodeInvalidError,
  SetupCodeExpiredError,
  SetupCodeAlreadyRedeemedError,
} from '../../../src/errors/user-errors';
import { InvalidEmailError } from '../../../src/value-objects/email';
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

const IDENTITY = { username: 'secretaire', fullName: 'Fatima Zahra', email: 'fatima@centre.ma' };

/** Invite an employee (role only) and return the plaintext setup code. `idSeed`
 *  varies so two invites in one test get distinct ids (the fake id generator
 *  restarts per instance). */
async function invite(
  clock: ReturnType<typeof fakeClock>,
  users: InMemoryUserRepository,
  idSeed = 1,
) {
  return new CreateUser(users, fakeHasher(), fakeSecureRandom(), clock, fakeIds(idSeed)).execute({
    role: 'secretary',
    ...CONTEXT,
  });
}

describe('RedeemSetupCode (code-first onboarding)', () => {
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
    it('sets the identity + password and clears ALL setup-code fields', async () => {
      await redeem.execute({ setupCode, newPassword: NEW_PASSWORD, ...IDENTITY });

      const user = await users.findByUsername('secretaire');
      expect(user?.username).toBe('secretaire');
      expect(user?.fullName).toBe('Fatima Zahra');
      expect(user?.email).toBe('fatima@centre.ma');
      expect(user?.passwordHash).toBe(`hashed:${NEW_PASSWORD}`);
      expect(user?.setupCodeHash).toBeNull();
      expect(user?.setupCodeExpiresAt).toBeNull();
      expect(user?.setupCodeRedeemedAt).toEqual(new Date(NOW));
    });

    it('keeps the role bound to the code — it is never taken from the staff input', async () => {
      await redeem.execute({ setupCode, newPassword: NEW_PASSWORD, ...IDENTITY });
      expect((await users.findByUsername('secretaire'))?.role).toBe('secretary');
    });

    it('normalizes the chosen email + username to their canonical form', async () => {
      await redeem.execute({
        setupCode,
        newPassword: NEW_PASSWORD,
        username: '  Secretaire ',
        fullName: '  Fatima Zahra  ',
        email: '  Fatima@Centre.MA ',
      });
      const user = await users.findByUsername('secretaire');
      expect(user?.username).toBe('Secretaire');
      expect(user?.email).toBe('fatima@centre.ma');
    });

    it('lets the employee log in afterwards', async () => {
      await redeem.execute({ setupCode, newPassword: NEW_PASSWORD, ...IDENTITY });
      const verify = new VerifyUserPassword(users, fakeHasher());
      const identity = await verify.execute({ username: 'secretaire', password: NEW_PASSWORD });
      expect(identity).toMatchObject({ username: 'secretaire', role: 'secretary' });
    });
  });

  describe('username uniqueness (SOU-153, case-insensitive)', () => {
    it('rejects a username already held by another live account', async () => {
      await redeem.execute({ setupCode, newPassword: NEW_PASSWORD, ...IDENTITY });
      const { setupCode: second } = await invite(clock, users, 2);
      await expect(
        redeem.execute({
          setupCode: second,
          newPassword: NEW_PASSWORD,
          username: '  SECRETAIRE ',
          fullName: 'Autre',
          email: 'autre@centre.ma',
        }),
      ).rejects.toBeInstanceOf(UsernameAlreadyTakenError);
    });
  });

  describe('single-use', () => {
    it('rejects a second redemption of the same code', async () => {
      await redeem.execute({ setupCode, newPassword: NEW_PASSWORD, ...IDENTITY });
      await expect(
        redeem.execute({
          setupCode,
          newPassword: NEW_PASSWORD,
          username: 'autre',
          fullName: 'Autre',
          email: 'autre@centre.ma',
        }),
      ).rejects.toBeInstanceOf(SetupCodeInvalidError);
    });

    it('maps a lost redemption race to already-redeemed without clobbering the winner (TOCTOU)', async () => {
      // The pre-read saw a pending code, but a concurrent redemption committed
      // first, so the CAS matches no row (markSetupCodeRedeemed → false). The use
      // case must reject, not overwrite the winner's password.
      class RacyRepo extends InMemoryUserRepository {
        async markSetupCodeRedeemed(): Promise<boolean> {
          return false;
        }
      }
      const racy = new RacyRepo();
      const racyClock = fakeClock(NOW);
      const { setupCode: racyCode } = await invite(racyClock, racy);

      await expect(
        new RedeemSetupCode(racy, fakeHasher(), racyClock).execute({
          setupCode: racyCode,
          newPassword: NEW_PASSWORD,
          ...IDENTITY,
        }),
      ).rejects.toBeInstanceOf(SetupCodeAlreadyRedeemedError);
      const invited = (await racy.listPendingInvites())[0];
      expect(invited?.passwordHash).toBeNull();
    });
  });

  describe('expiry', () => {
    it('rejects a code presented after its expiry window', async () => {
      clock.advance(SETUP_CODE_TTL_MS + 1);
      await expect(
        redeem.execute({ setupCode, newPassword: NEW_PASSWORD, ...IDENTITY }),
      ).rejects.toBeInstanceOf(SetupCodeExpiredError);
    });
  });

  describe('invalid input', () => {
    it('rejects a wrong code without revealing whether an invite exists', async () => {
      await expect(
        redeem.execute({ setupCode: 'ZZZZ-ZZZZ-ZZZZ', newPassword: NEW_PASSWORD, ...IDENTITY }),
      ).rejects.toBeInstanceOf(SetupCodeInvalidError);
    });

    it('rejects a malformed email', async () => {
      await expect(
        redeem.execute({ setupCode, newPassword: NEW_PASSWORD, ...IDENTITY, email: 'not-an-email' }),
      ).rejects.toBeInstanceOf(InvalidEmailError);
    });

    it('rejects a weak new password', async () => {
      await expect(
        redeem.execute({ setupCode, newPassword: 'weak', ...IDENTITY }),
      ).rejects.toThrow();
    });
  });
});
