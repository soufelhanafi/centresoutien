import type { UserRepository } from '../ports/user-repository';
import type { PasswordHasher } from '../ports/password-hasher';
import type { AuthenticatedUser } from './attempt-login';
import { canLogin } from '../entities/user';

export type VerifyUserPasswordInput = {
  username: string;
  password: string;
};

// Resolves a login attempt against the `users` table (SOU-252), the multi-user
// successor to `VerifyAdminPassword`. Returns the AuthenticatedUser on a match, or
// `null` on any failure — an unknown username, an employee who has not yet redeemed
// their setup code (no password set), or a wrong password are all indistinguishable
// to the caller, so login cannot be used to enumerate accounts.
//
// A pure credential check: attempt counting and lockout are layered on top by
// AttemptLogin. The username is passed straight to the repository, which matches
// case-insensitively via `normalizeUsername` (SOU-153) — one normalization rule.
export class VerifyUserPassword {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(input: VerifyUserPasswordInput): Promise<AuthenticatedUser | null> {
    const user = await this.users.findByUsername(input.username);
    if (user === null || !canLogin(user) || user.passwordHash === null) return null;

    const matches = await this.hasher.verify(user.passwordHash, input.password);
    if (!matches) return null;

    return { userId: user.id, username: user.username, role: user.role, permissions: user.permissions };
  }
}
