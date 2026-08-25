import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * The errors `user.redeemSetupCode` raises (SOU-303), as the renderer must handle
 * them. The three setup-code codes are distinct user-facing messages (invalid vs
 * expired vs already redeemed) shown on the code field; `username-already-taken`
 * routes to the username field and `invalid-email` to the email field — all via
 * `t(\`errors.${code}\`)`. Password-strength / required-field codes are caught
 * client-side by the shared Zod schema before submission, so they are not repeated
 * here.
 */
export type RedeemSetupCodeErrorCode =
  | 'setup-code-invalid'
  | 'setup-code-expired'
  | 'setup-code-already-redeemed'
  | 'username-already-taken'
  | 'invalid-email';

const CODES = new Set<string>([
  'setup-code-invalid',
  'setup-code-expired',
  'setup-code-already-redeemed',
  'username-already-taken',
  'invalid-email',
] satisfies RedeemSetupCodeErrorCode[]);

export function mapRedeemSetupCodeError(error: unknown): RedeemSetupCodeErrorCode | null {
  const code = resolveDomainErrorCode(error);
  return code !== null && CODES.has(code) ? (code as RedeemSetupCodeErrorCode) : null;
}
