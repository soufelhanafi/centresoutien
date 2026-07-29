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
 * The username is trimmed before lookup so it matches on the same key the create
 * path stores: `adminCredentialsSchema` trims on the way in, so an admin who
 * types a trailing space at the login screen must still match. Normalizing here
 * (rather than only at the IPC boundary) keeps the matching rule in the domain
 * for every future adapter.
 */
export class VerifyAdminPassword {
  constructor(
    private readonly accounts: AdminAccountRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(input: VerifyAdminPasswordInput): Promise<boolean> {
    const account = await this.accounts.findByUsername(input.username.trim());
    if (!account) return false;
    return this.hasher.verify(account.passwordHash, input.password);
  }
}
