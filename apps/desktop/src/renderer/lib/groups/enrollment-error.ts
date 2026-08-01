import { decodeDomainError } from '../../../shared/ipc/domain-error';

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
 * The domain error's stable `code`, decoded from a rejected IPC call. The main
 * dispatcher encodes the code into the rejection's *message* (see
 * `shared/ipc/domain-error`) because neither the Electron IPC bridge nor the
 * preload contextBridge preserves custom error properties — only `message`
 * survives both hops. So we read `code` directly when present (in-process paths)
 * and otherwise decode it from `message`.
 */
function domainErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code === 'string') return code;
  if (typeof message === 'string') return decodeDomainError(message)?.code ?? null;
  return null;
}

/**
 * Resolve a rejected `enrollment.create` error to its stable code, or `null` when
 * it is not one of the four business guards (e.g. a validation or transport
 * error) — the caller then falls back to its generic message.
 */
export function enrollmentErrorCode(error: unknown): EnrollmentErrorCode | null {
  const code = domainErrorCode(error);
  return code !== null && CODES.has(code) ? (code as EnrollmentErrorCode) : null;
}
