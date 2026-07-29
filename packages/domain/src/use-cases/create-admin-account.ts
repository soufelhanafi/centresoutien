import type { AdminAccountRepository } from '../ports/admin-account-repository';
import type { PasswordHasher } from '../ports/password-hasher';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import { adminCredentialsSchema, type AdminCredentials } from '../schemas/admin-account';
import { AdminAccountAlreadyExistsError } from '../errors/auth-errors';
import {
  ADMIN_ACCOUNT_ID_PREFIX,
  type AdminAccount,
  type AdminAccountId,
} from '../entities/admin-account';

export type CreateAdminAccountInput = AdminCredentials;

/**
 * Creates the single local admin account (SOU-26). Validates credentials with
 * the shared schema (password strength included), enforces the single-admin
 * invariant, and hashes the password through the injected {@link PasswordHasher}
 * — the plaintext is never persisted. Not plan-gated: auth is foundational and
 * present on every plan.
 */
export class CreateAdminAccount {
  constructor(
    private readonly accounts: AdminAccountRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(input: CreateAdminAccountInput): Promise<AdminAccount> {
    const { username, password } = adminCredentialsSchema.parse(input);

    if (await this.accounts.exists()) {
      throw new AdminAccountAlreadyExistsError();
    }

    const now = this.clock.now();
    const account: AdminAccount = {
      id: this.ids.next(ADMIN_ACCOUNT_ID_PREFIX) as AdminAccountId,
      username,
      passwordHash: await this.hasher.hash(password),
      createdAt: now,
      updatedAt: now,
    };

    await this.accounts.save(account);
    return account;
  }
}
