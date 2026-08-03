import type { AdminAccountRepository } from '../ports/admin-account-repository';
import type { PasswordHasher } from '../ports/password-hasher';

export type VerifyAdminPasswordInput = {
  username: string;
  password: string;
};

/**
 * Verifies a login attempt against the stored admin account (SOU-26). Returns a
 * plain boolean — an unknown username is a rejection, not an error, so callers
 * cannot distinguish "no such user" from "wrong password". Attempt counting and
 * lockout are layered on top in SOU-27; this use case stays a pure credential
 * check.
 *
 * The raw typed username is passed straight to the repository: every
 * `AdminAccountRepository.findByUsername` implementation matches
 * case-insensitively (trim + lowercase, SOU-153), so an admin who types a
 * trailing space or the wrong casing at the login screen still matches. That
 * keeps the one normalization rule in a single place instead of duplicating it
 * here and in every adapter.
 */
export class VerifyAdminPassword {
  constructor(
    private readonly accounts: AdminAccountRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(input: VerifyAdminPasswordInput): Promise<boolean> {
    const account = await this.accounts.findByUsername(input.username);
    if (!account) return false;
    return this.hasher.verify(account.passwordHash, input.password);
  }
}
