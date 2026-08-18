import type { AdminAccountRepository } from '../ports/admin-account-repository';
import type { PasswordHasher } from '../ports/password-hasher';
import type { Clock } from '../ports/clock';
import { changeAdminPasswordSchema } from '../schemas/admin-account';
import { AdminAccountNotFoundError, InvalidCurrentPasswordError } from '../errors/auth-errors';

export type ChangeAdminPasswordInput = {
  currentPassword: string;
  newPassword: string;
};

/**
 * Changes the sole admin account's password (SOU-31). Single-admin app: no
 * username re-entry — `findOnly()` resolves the one account. Verifies
 * `currentPassword` through the injected {@link PasswordHasher} before
 * re-hashing `newPassword`; the plaintext never touches storage either way.
 * No "must differ from current" rule (KICKOFF: minimal scope).
 *
 * Replication is the DOMAIN's call (SOU-258): the owner's credential write
 * replicates iff the owner already participates in the sync feed — a migrated
 * owner (backfilled by migration 0044, device-local ULID, no sync presence)
 * stays device-local, because pushing it would collide on
 * `ux_users_username_live`. The adapter persists the row + conditional log in
 * one transaction; it never re-derives this policy.
 */
export class ChangeAdminPassword {
  constructor(
    private readonly accounts: AdminAccountRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async execute(input: ChangeAdminPasswordInput): Promise<void> {
    const { currentPassword, newPassword } = changeAdminPasswordSchema.parse(input);

    const account = await this.accounts.findOnly();
    if (!account) throw new AdminAccountNotFoundError();

    const verified = await this.hasher.verify(account.passwordHash, currentPassword);
    if (!verified) throw new InvalidCurrentPasswordError();

    account.passwordHash = await this.hasher.hash(newPassword);
    account.updatedAt = this.clock.now();
    const replicate = await this.accounts.participatesInSync(account.id);
    await this.accounts.save(account, { replicate });
  }
}
