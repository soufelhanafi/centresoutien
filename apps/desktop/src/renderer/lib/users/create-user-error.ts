import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * Decodes the stable `code` of a `user.create` rejection (SOU-303) so the renderer
 * can localize a fixed line via `t(\`errors.${code}\`)`. Code-first invites carry
 * only a role, so the reachable domain codes are the defensive role guards
 * (`invalid-user-role`, `role-not-invitable`), the SOU-265 authorization guards
 * (`insufficient-role` / `not-authenticated`), and the shared schema's
 * `role-required`. Returns `null` only when no domain code is present (an
 * unexpected/transport error), which the caller renders as the generic toast.
 */
export function mapCreateUserError(error: unknown): string | null {
  return resolveDomainErrorCode(error);
}
