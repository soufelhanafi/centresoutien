import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * The enrollment guards the add-student flow surfaces with their own localized
 * message (SOU-51). Each value is both the domain error's stable `code` and the
 * `errors.*` i18n key the renderer resolves — so the UI shows *why* an enrollment
 * was rejected instead of one blanket toast.
 */
export type EnrollmentErrorCode =
  | 'group-full'
  | 'duplicate-enrollment'
  | 'cross-kind-enrollment'
  | 'enrollment-subscription-missing';

const CODES = new Set<string>([
  'group-full',
  'duplicate-enrollment',
  'cross-kind-enrollment',
  'enrollment-subscription-missing',
] satisfies EnrollmentErrorCode[]);

/**
 * Resolve a rejected `enrollment.create` error to its stable code, or `null` when
 * it is not one of the four business guards (e.g. a validation or transport
 * error) — the caller then falls back to its generic message.
 */
export function enrollmentErrorCode(error: unknown): EnrollmentErrorCode | null {
  const code = resolveDomainErrorCode(error);
  return code !== null && CODES.has(code) ? (code as EnrollmentErrorCode) : null;
}
