import type { UserRepository } from '../ports/user-repository';
import type { PasswordHasher } from '../ports/password-hasher';
import type { Clock } from '../ports/clock';
import { redeemSetupCodeInputSchema, type RedeemSetupCodeInput } from '../schemas/user';
import { normalizeEmail } from '../value-objects/email';
import { hasEstablishedIdentity } from '../entities/user';
import { resolvePendingInviteByCode } from './pending-invite';
import {
  UsernameAlreadyTakenError,
  SetupCodeInvalidError,
  SetupCodeExpiredError,
  SetupCodeAlreadyRedeemedError,
} from '../errors/user-errors';

// First-login redemption (SOU-303, code-first). The invited staff prove they hold
// the one-time setup code — which is BOTH the locator and the authorization: the
// role is bound to the code and can never be self-asserted — then set their own
// username, full name, email, and password. The director never learns any of them.
//
// The invite is resolved by the CODE, not a username: at first login the staff have
// not chosen a username yet (the row carries a placeholder), so the use case scans
// the un-redeemed invites and verifies the code against each — expired-but-unredeemed
// rows are included (so expiry can be reported distinctly), and expiry is checked
// AFTER a match. The set is tiny (one center's open invites) and this runs once per
// hire, so the linear verify is cheap and keeps the full code entropy (no locator
// column to weaken it). A wrong/absent code is an opaque SetupCodeInvalidError so a
// caller cannot probe which invites are open.
//
// The commit is an atomic compare-and-set via `markSetupCodeRedeemed`: it sets the
// password AND the chosen identity, clears the code + expiry, and stamps the
// redemption only while the row is still pending on the verified hash. A `false`
// return maps to SetupCodeAlreadyRedeemedError so a lost race can never clobber the
// winner's password; a same-username race that slips past the pre-check trips the
// live-username uniqueness index and surfaces as UsernameAlreadyTakenError.
export class RedeemSetupCode {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async execute(input: RedeemSetupCodeInput): Promise<void> {
    const { setupCode, username, fullName, email, newPassword } =
      redeemSetupCodeInputSchema.parse(input);
    const canonicalEmail = normalizeEmail(email);

    const now = this.clock.now();
    const invite = await resolvePendingInviteByCode(this.users, this.hasher, setupCode);
    if (invite.user.setupCodeExpiresAt === null || now.getTime() > invite.user.setupCodeExpiresAt) {
      throw new SetupCodeExpiredError();
    }

    if (hasEstablishedIdentity(invite.user)) {
      // The account has already onboarded — a director-reissued code here is a
      // password recovery, not identity capture. That path is handled by its own
      // use case; redeeming it as a first onboarding would overwrite the staff's
      // chosen username, so it is rejected as an invalid code for THIS flow.
      throw new SetupCodeInvalidError();
    }

    const clash = await this.users.findByUsername(username);
    if (clash !== null && clash.id !== invite.user.id) {
      throw new UsernameAlreadyTakenError(username);
    }

    const redeemed = await this.users.markSetupCodeRedeemed({
      id: invite.user.id,
      expectedSetupCodeHash: invite.setupCodeHash,
      passwordHash: await this.hasher.hash(newPassword),
      redeemedAt: now,
      updatedBy: invite.user.id,
      identity: { username, fullName, email: canonicalEmail },
    });
    if (!redeemed) throw new SetupCodeAlreadyRedeemedError();
  }
}
