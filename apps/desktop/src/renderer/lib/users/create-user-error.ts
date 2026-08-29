import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * Decodes the stable `code` of a `user.create` rejection so the renderer can
 * localize a fixed line via `t(\`errors.${code}\`)`. The director sets credentials
 * directly, so the reachable domain codes are `username-already-taken`, the
 * password / username validation codes (`password-too-short`,
 * `password-needs-uppercase`, `username-too-short`, …), the defensive role guards
 * (`invalid-user-role`, `role-not-invitable`, `role-required`), and the SOU-265
 * authorization guards (`insufficient-role` / `not-authenticated`). Returns `null`
 * only when no domain code is present (an unexpected/transport error), which the
 * caller renders as the generic toast.
 */
export function mapCreateUserError(error: unknown): string | null {
  return resolveDomainErrorCode(error);
}
