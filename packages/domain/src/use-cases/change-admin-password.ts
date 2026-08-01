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
    await this.accounts.save(account);
  }
}
