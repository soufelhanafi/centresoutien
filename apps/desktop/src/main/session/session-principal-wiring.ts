import type { UserId } from '@centresoutien/domain';
import {
  SessionPrincipalService,
  type ActiveSessionReader,
  type SessionPrincipal,
  type UserByIdReader,
} from './session-principal';

// The trusted-principal control surface the IPC handlers wire: login establishes
// it, the role guard resolves it, logout/reset clear it.
export type SessionPrincipalControls = {
  resolvePrincipal: () => Promise<SessionPrincipal | null>;
  setPrincipal: (principal: SessionPrincipal) => void;
  clearPrincipal: () => void;
};

// The identity-attribution seam (SOU-265), kept out of the composition root so it
// stays the single place adapters are constructed without swelling further.
export type SessionPrincipalWiring = SessionPrincipalControls & {
  // The effective `updatedBy` for every write: the signed-in user when a principal
  // is established, else the local placeholder for pre-login / first-run bootstrap
  // writes (creating the very first owner, seeding a fresh center). Resolved per
  // call so it tracks login/logout live.
  resolveUpdatedBy: () => UserId;
};

export function wireSessionPrincipal(
  sessions: ActiveSessionReader,
  users: UserByIdReader,
  bootstrapUserId: UserId,
): SessionPrincipalWiring {
  const service = new SessionPrincipalService(sessions, users);
  // Seed from the remembered session (which carries the user id) + the users table
  // (for the role) before the window opens, so a remember-me reopen attributes
  // writes to the real user. This is the ONLY persisted-session re-resolution site:
  // an in-run login establishes the principal in memory directly. Fire-and-forget
  // like the scheduled backup — a failed seed just leaves the bootstrap fallback.
  void service.resolve().catch((error: unknown) => {
    console.error('[auth] failed to resolve session principal at startup', error);
  });
  return {
    resolveUpdatedBy: () => service.current()?.userId ?? bootstrapUserId,
    resolvePrincipal: () => service.resolve(),
    setPrincipal: (principal) => service.set(principal),
    clearPrincipal: () => service.clear(),
  };
}
