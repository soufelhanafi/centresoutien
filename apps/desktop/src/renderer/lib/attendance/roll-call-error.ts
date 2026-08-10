import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';
import { isSessionOutsideOverrideHoursError } from './session-outside-override-hours-error';

/**
 * The domain guards the roll-call flow surfaces with their own message:
 * `session-not-found` (a stale/foreign-center `sessionId`, practically
 * unreachable since this screen resolves the session itself) and
 * `outside-windows` — the picked date's fixed slot falls outside an active
 * center-hours override's windows (the iftar gap, SOU-165), so the session is
 * skipped and the admin must re-time it. Mirrors `enrollmentErrorCode`.
 */
export type RollCallErrorCode = 'session-not-found' | 'outside-windows';

const CODES = new Set<string>(['session-not-found'] satisfies RollCallErrorCode[]);

/** Resolves a rejected roll-call error to its stable code, or `null`
 *  for a validation or transport failure the caller should toast generically. */
export function rollCallErrorCode(error: unknown): RollCallErrorCode | null {
  if (isSessionOutsideOverrideHoursError(error)) return 'outside-windows';
  const code = resolveDomainErrorCode(error);
  return code !== null && CODES.has(code) ? (code as RollCallErrorCode) : null;
}
