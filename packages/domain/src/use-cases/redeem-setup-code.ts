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

// First-login redemption (SOU-252): an invited employee proves they hold the
// one-time setup code and sets their own password. Single-use and time-bounded —
// the code is rejected if already redeemed (SetupCodeAlreadyRedeemedError) or past
// its expiry (SetupCodeExpiredError), and a wrong/absent code is an opaque
// SetupCodeInvalidError so a caller cannot probe which accounts have an invite.
//
// The commit is an atomic compare-and-set via `markSetupCodeRedeemed`, not a
// read-modify-write: two concurrent redemptions cannot both win. The early checks
// below give precise errors on the common paths; the CAS is the authority on the
// race — a `false` return (the row is no longer pending on the verified hash) maps
// to SetupCodeAlreadyRedeemedError, so a second redemption can never clobber the
// first password. On success the setup code hash AND its expiry are cleared and the
// redemption is stamped, all in one write; the director never learns the password.
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
    const pendingHash = user.setupCodeHash;
    if (pendingHash === null) throw new SetupCodeInvalidError();

    const now = this.clock.now();
    if (user.setupCodeExpiresAt === null || now.getTime() > user.setupCodeExpiresAt) {
      throw new SetupCodeExpiredError();
    }

    const matches = await this.hasher.verify(pendingHash, setupCode);
    if (!matches) throw new SetupCodeInvalidError();

    const redeemed = await this.users.markSetupCodeRedeemed({
      id: user.id,
      expectedSetupCodeHash: pendingHash,
      passwordHash: await this.hasher.hash(newPassword),
      redeemedAt: now,
      updatedBy: user.id,
    });
    if (!redeemed) throw new SetupCodeAlreadyRedeemedError();
  }
}
