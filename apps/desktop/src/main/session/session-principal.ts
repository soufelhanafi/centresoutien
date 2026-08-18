import type { Role, User, UserId } from '@centresoutien/domain';

// The trusted identity of whoever is signed in on this device (SOU-265).
export type SessionPrincipal = {
  readonly userId: UserId;
  readonly role: Role;
};

// The slice of DeviceSessionService the resolver needs — the live user id.
export interface ActiveSessionReader {
  activeUserId(): Promise<UserId | null>;
}

// The slice of UserRepository the resolver needs — resolve a user by id.
export interface UserByIdReader {
  findById(id: UserId): Promise<User | null>;
}

// Holds the main process's trusted session principal (SOU-265).
//
// The renderer is NOT the source of identity — it is untrusted input. The
// principal is established two ways:
// - `set` (login): the authoritative moment. The login use case has already
//   verified the credential and resolved who is in, so login stamps the
//   principal in memory directly from that result — independent of whether a
//   remember-me session was persisted. A non-remembered login persists no
//   session, so re-reading the session would wrongly resolve to null.
// - `resolve` (remember-me reopen): recovers the principal server-side from the
//   remembered device session (the row carries the user id) + the User row (for
//   the role, resolved fresh so a role change or removed user takes effect at
//   once). Seeded at startup so a reopened remembered device has an identity.
//
// Two access shapes, because the two consumers differ:
// - `resolve` is async — the authoritative read the IPC role guard runs per
//   director-only call. It refreshes the cache as a side effect.
// - `current` is a synchronous snapshot of the last established principal — the
//   envelope context reads it to stamp `updatedBy` without turning every write
//   into an async DB round trip. `null` until the first `set`/`resolve`, which
//   the caller treats as the bootstrap/first-run fallback.
//
// A monotonic `generation` token serializes concurrent `resolve` against
// `clear`/`set`: a `resolve` snapshots the generation before its awaits and only
// commits its result if the generation still matches. A `clear` (logout/reset)
// or `set` (login) bumps the generation, so a resolve already in flight can
// never resurrect a logged-out principal nor clobber a freshly-established one.
//
// Degrades safely: a device with no remembered session, an expired one, a legacy
// pre-SOU-265 row (no user id), or a session pointing at a since-removed user all
// resolve to `null` — an unknown principal, never a crash. A transient read error
// fails closed: the guard rejects and the cache is left null, never a stale
// principal a later write would trust as fresh.
export class SessionPrincipalService {
  private cached: SessionPrincipal | null = null;
  private generation = 0;

  constructor(
    private readonly sessions: ActiveSessionReader,
    private readonly users: UserByIdReader,
  ) {}

  async resolve(): Promise<SessionPrincipal | null> {
    const generation = this.generation;
    try {
      const userId = await this.sessions.activeUserId();
      const user = userId === null ? null : await this.users.findById(userId);
      const resolved: SessionPrincipal | null =
        userId !== null && user !== null ? { userId, role: user.role } : null;
      // A clear() or set() landed while our reads were in flight — its outcome is
      // newer than ours, so discard this now-stale result rather than resurrect a
      // logged-out user or overwrite a just-established login.
      if (generation !== this.generation) return null;
      this.cached = resolved;
      return resolved;
    } catch (error) {
      // Fail closed: a now-unverifiable principal must not survive for
      // authorization. Only null the cache if nothing newer superseded us.
      if (generation === this.generation) this.cached = null;
      throw error;
    }
  }

  // Login establishes the principal directly from the verified identity.
  set(principal: SessionPrincipal): void {
    this.generation += 1;
    this.cached = principal;
  }

  current(): SessionPrincipal | null {
    return this.cached;
  }

  clear(): void {
    this.generation += 1;
    this.cached = null;
  }
}
