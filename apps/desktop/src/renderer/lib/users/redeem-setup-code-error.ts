import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * The errors `user.redeemSetupCode` raises (SOU-256), as the renderer must
 * handle them. `user-not-found` maps to the username field; the three setup-code
 * codes are distinct user-facing messages (invalid vs expired vs already
 * redeemed) shown on the code field via `t(\`errors.${code}\`)`. Password-strength
 * codes are caught client-side by the shared Zod schema before submission, so
 * they are not repeated here.
 */
export type RedeemSetupCodeErrorCode =
  | 'user-not-found'
  | 'setup-code-invalid'
  | 'setup-code-expired'
  | 'setup-code-already-redeemed';

const CODES = new Set<string>([
  'user-not-found',
  'setup-code-invalid',
  'setup-code-expired',
  'setup-code-already-redeemed',
] satisfies RedeemSetupCodeErrorCode[]);

export function mapRedeemSetupCodeError(error: unknown): RedeemSetupCodeErrorCode | null {
  const code = resolveDomainErrorCode(error);
  return code !== null && CODES.has(code) ? (code as RedeemSetupCodeErrorCode) : null;
}
