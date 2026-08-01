import {
  CrossKindEnrollmentError,
  DuplicateEnrollmentError,
  EnrollmentSubscriptionMissingError,
  GroupFullError,
} from '@centresoutien/domain';

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

/**
 * The domain error class name → stable code. We key on the exported class's
 * `.name` (not a hand-typed string) so a rename in the domain is caught at
 * compile time. Class names are the reliable signal across the IPC boundary:
 * Electron reconstructs a thrown handler error with its original `name` and
 * `message`, but `instanceof` fails (it is a plain `Error`, not the domain
 * subclass) and custom own-properties may not survive — so we match `name` and
 * also accept a preserved `code` when present.
 */
const NAME_TO_CODE: Record<string, EnrollmentErrorCode> = {
  [GroupFullError.name]: 'group-full',
  [DuplicateEnrollmentError.name]: 'duplicate-enrollment',
  [CrossKindEnrollmentError.name]: 'cross-kind-enrollment',
  [EnrollmentSubscriptionMissingError.name]: 'enrollment-subscription-missing',
};

const CODES = new Set<string>(Object.values(NAME_TO_CODE));

/**
 * Resolve a rejected `enrollment.create` error to its stable code, or `null` when
 * it is not one of the four business guards (e.g. a validation or transport
 * error) — the caller then falls back to its generic message.
 */
export function enrollmentErrorCode(error: unknown): EnrollmentErrorCode | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code, name } = error as { code?: unknown; name?: unknown };
  if (typeof code === 'string' && CODES.has(code)) return code as EnrollmentErrorCode;
  if (typeof name === 'string' && name in NAME_TO_CODE) return NAME_TO_CODE[name] ?? null;
  return null;
}
