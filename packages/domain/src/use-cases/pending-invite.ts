import type { UserRepository } from '../ports/user-repository';
import type { PasswordHasher } from '../ports/password-hasher';
import type { User } from '../entities/user';
import { SetupCodeInvalidError } from '../errors/user-errors';

// A pending invite located by the code the staff presented, carried with the
// verified hash so a later compare-and-set commit can guard on exactly that value.
export type ResolvedInvite = { readonly user: User; readonly setupCodeHash: string };

// Resolves the currently-pending invite a setup code belongs to (SOU-303). At first
// login the staff have not chosen a username yet, so the invite is located by the
// CODE, not a username: scan the un-redeemed invites and verify the code against
// each. The set is tiny (only pending invites of one center) and this runs once per
// hire, so the linear verify is cheap and keeps the full code entropy. A wrong or
// absent code is an opaque SetupCodeInvalidError so a caller cannot probe which
// invites are open. Expiry is NOT checked here — the caller reports it distinctly
// after resolving, so an expired but genuine code reads as "expired", not "invalid".
export async function resolvePendingInviteByCode(
  users: UserRepository,
  hasher: PasswordHasher,
  setupCode: string,
): Promise<ResolvedInvite> {
  const pending = await users.listPendingInvites();
  for (const user of pending) {
    const hash = user.setupCodeHash;
    if (hash !== null && (await hasher.verify(hash, setupCode))) {
      return { user, setupCodeHash: hash };
    }
  }
  throw new SetupCodeInvalidError();
}
