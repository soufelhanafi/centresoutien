import type { UserRepository } from '../ports/user-repository';
import type { PasswordHasher } from '../ports/password-hasher';
import type { Clock } from '../ports/clock';
import { redeemSetupCodeInputSchema, type RedeemSetupCodeInput } from '../schemas/user';
import {
  UserNotFoundError,
  SetupCodeInvalidError,
  SetupCodeExpiredError,
  SetupCodeAlreadyRedeemedError,
} from '../errors/user-errors';

/**
 * First-login redemption (SOU-252): an invited employee proves they hold the
 * one-time setup code and sets their own password. Single-use and time-bounded —
 * the code is rejected if already redeemed ({@link SetupCodeAlreadyRedeemedError})
 * or past its expiry ({@link SetupCodeExpiredError}), and a wrong/absent code is
 * an opaque {@link SetupCodeInvalidError} so a caller cannot probe which accounts
 * have an outstanding invite.
 *
 * On success the chosen password is hashed via the {@link PasswordHasher}, the
 * setup code hash is cleared, and the redemption is stamped — the account can
 * now log in. The director never learns the password: the plaintext only exists
 * on the employee's device during this call.
 */
export class RedeemSetupCode {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async execute(input: RedeemSetupCodeInput): Promise<void> {
    const { username, setupCode, newPassword } = redeemSetupCodeInputSchema.parse(input);

    const user = await this.users.findByUsername(username);
    if (user === null) throw new UserNotFoundError();

    if (user.setupCodeRedeemedAt !== null) throw new SetupCodeAlreadyRedeemedError();
    if (user.setupCodeHash === null) throw new SetupCodeInvalidError();

    const now = this.clock.now();
    if (user.setupCodeExpiresAt === null || now.getTime() > user.setupCodeExpiresAt.getTime()) {
      throw new SetupCodeExpiredError();
    }

    const matches = await this.hasher.verify(user.setupCodeHash, setupCode);
    if (!matches) throw new SetupCodeInvalidError();

    user.passwordHash = await this.hasher.hash(newPassword);
    user.setupCodeHash = null;
    user.setupCodeRedeemedAt = now;
    user.updatedAt = now;
    user.updatedBy = user.id;

    await this.users.save(user);
  }
}
