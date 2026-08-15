import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * Decodes the stable `code` of a `user.create` rejection (SOU-256) so the renderer
 * can localize a fixed line via `t(\`errors.${code}\`)`. Any decoded code is
 * returned as-is: beyond the domain codes (`username-already-taken`,
 * `invalid-user-role`, `role-not-invitable`) the shared Zod schema can also reject
 * with `role-required` / `username-too-short` / `username-too-long` — those have
 * their own translated messages, so surfacing the specific code beats collapsing
 * them into the generic form toast. `username-already-taken` is the one the caller
 * routes to the username field; the rest fall back to a toast. Returns `null` only
 * when no domain code is present (an unexpected/transport error).
 */
export const USERNAME_FIELD_ERROR = 'username-already-taken';

export function mapCreateUserError(error: unknown): string | null {
  return resolveDomainErrorCode(error);
}
