import type { UserRepository } from '../ports/user-repository';
import type { PasswordHasher } from '../ports/password-hasher';
import type { SecureRandom } from '../ports/secure-random';
import type { Clock } from '../ports/clock';
import type { UserId } from '../value-objects/ids';
import { isInvitableRole } from '../value-objects/role';
import { SETUP_CODE_TTL_MS, type User } from '../entities/user';
import { UserNotFoundError, RoleNotInvitableError } from '../errors/user-errors';
import { generateSetupCode } from './setup-code';

export type ReissueSetupCodeCommand = {
  readonly userId: UserId;
  readonly updatedBy: UserId;
};

export type ReissueSetupCodeResult = {
  readonly user: User;
  readonly setupCode: string;
};

// Director-issued recovery (SOU-303): when a staff member can't self-reset (offline,
// or lost access to their email), the director re-opens their setup code — mints a
// fresh one-time code and clears the redeemed stamp — so the staff redeem it and set
// a new password, exactly like first login. The SAME `userId` is preserved (no
// delete/recreate), so the payment audit trail stays intact; the account keeps its
// username/full name/email and its existing password until the new code is redeemed.
// The director never learns or sets the password.
//
// Only an invitable role (secretary) can be re-issued a code — the owner recovers
// through their own email / recovery-code path, and admin/viewer are unused — so an
// owner row is rejected with RoleNotInvitableError, mirroring the invite guard.
export class ReissueSetupCode {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly random: SecureRandom,
    private readonly clock: Clock,
  ) {}

  async execute(command: ReissueSetupCodeCommand): Promise<ReissueSetupCodeResult> {
    const user = await this.users.findById(command.userId);
    if (user === null) throw new UserNotFoundError();
    if (!isInvitableRole(user.role)) throw new RoleNotInvitableError(user.role);

    const now = this.clock.now();
    const setupCode = generateSetupCode(this.random);

    // Targeted update of ONLY the setup-code fields (not a full-entity upsert from
    // the stale `user` snapshot), so a redemption racing between the read above and
    // this write can never be reverted — the chosen username/password are untouched.
    const next = await this.users.reopenSetupCode({
      id: user.id,
      setupCodeHash: await this.hasher.hash(setupCode),
      setupCodeExpiresAt: now.getTime() + SETUP_CODE_TTL_MS,
      updatedAt: now,
      updatedBy: command.updatedBy,
    });
    if (next === null) throw new UserNotFoundError();

    return { user: next, setupCode };
  }
}
