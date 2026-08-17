import type { Role, User, UserId } from '@centresoutien/domain';

/** The trusted identity of whoever is signed in on this device (SOU-265). */
export type SessionPrincipal = {
  readonly userId: UserId;
  readonly role: Role;
};

/** The slice of {@link DeviceSessionService} the resolver needs — the live user id. */
export interface ActiveSessionReader {
  activeUserId(): Promise<UserId | null>;
}

/** The slice of {@link UserRepository} the resolver needs — resolve a user by id. */
export interface UserByIdReader {
  findById(id: UserId): Promise<User | null>;
}

/**
 * Resolves and caches the main process's trusted session principal (SOU-265).
 *
 * The renderer is NOT the source of identity — it is untrusted input. The
 * principal is recovered server-side from the remembered device session: the
 * session row carries the user id (persisted at login so it survives a
 * remember-me reopen), and the role is resolved fresh from the {@link User} row
 * each time, so a role change or a removed user takes effect immediately.
 *
 * Two access shapes, because the two consumers differ:
 * - {@link resolve} is async — the authoritative read the IPC role guard runs per
 *   director-only call. It refreshes the cache as a side effect.
 * - {@link current} is a synchronous snapshot of the last resolve — the envelope
 *   context reads it to stamp `updatedBy` without turning every write into an
 *   async DB round trip. Seeded at startup and on login; `null` until the first
 *   resolve, which the caller treats as the bootstrap/first-run fallback.
 *
 * Degrades safely: a device with no remembered session, an expired one, a legacy
 * pre-SOU-265 row (no user id), or a session pointing at a since-removed user all
 * resolve to `null` — an unknown principal, never a crash.
 */
export class SessionPrincipalService {
  private cached: SessionPrincipal | null = null;

  constructor(
    private readonly sessions: ActiveSessionReader,
    private readonly users: UserByIdReader,
  ) {}

  async resolve(): Promise<SessionPrincipal | null> {
    const userId = await this.sessions.activeUserId();
    if (userId === null) {
      this.cached = null;
      return null;
    }
    const user = await this.users.findById(userId);
    if (user === null) {
      this.cached = null;
      return null;
    }
    this.cached = { userId, role: user.role };
    return this.cached;
  }

  current(): SessionPrincipal | null {
    return this.cached;
  }

  clear(): void {
    this.cached = null;
  }
}
