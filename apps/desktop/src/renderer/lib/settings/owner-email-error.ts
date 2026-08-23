import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * The single error `account.ownerEmail.set` can raise (SOU-273): the domain
 * Email VO's `InvalidEmailError`, thrown for a syntactically invalid address.
 * It carries no explicit domain `.code`, so the dispatcher falls back to the
 * class name — same pattern as `mapChangePasswordError`. The renderer routes it
 * to the email field as the `invalid-email` code (`errors.invalid-email`).
 */
export type OwnerEmailErrorCode = 'invalid-email';

const DECODED_CODE_TO_RENDERER_CODE: Readonly<Record<string, OwnerEmailErrorCode>> = {
  InvalidEmailError: 'invalid-email',
};

/**
 * Narrows a caught `account.ownerEmail.set` rejection to an
 * {@link OwnerEmailErrorCode}, or `null` for an unrelated failure the caller
 * should toast generically.
 */
export function mapOwnerEmailError(error: unknown): OwnerEmailErrorCode | null {
  const code = resolveDomainErrorCode(error);
  if (code !== null && code in DECODED_CODE_TO_RENDERER_CODE) {
    return DECODED_CODE_TO_RENDERER_CODE[code] ?? null;
  }
  return null;
}
