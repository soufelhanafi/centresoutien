import { NotAuthenticatedError, requireUserPermission, type PermissionFlag } from '@centresoutien/domain';
import type { SessionPrincipal } from '../session/session-principal';

/**
 * The one enforcement call every permission-gated IPC channel makes
 * (assistant-visibility): resolve the trusted principal, reject an
 * unauthenticated caller, then check the flag. Shared so every gated channel —
 * across `handlers.ts` and the split-out handler files — runs the exact same
 * check rather than each re-implementing the resolve/null/require sequence.
 */
export async function requirePermission(
  resolvePrincipal: () => Promise<SessionPrincipal | null>,
  flag: PermissionFlag,
): Promise<SessionPrincipal> {
  const principal = await resolvePrincipal();
  if (principal === null) throw new NotAuthenticatedError();
  requireUserPermission(principal, flag);
  return principal;
}
