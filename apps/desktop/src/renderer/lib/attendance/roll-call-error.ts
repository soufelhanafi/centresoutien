import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * The one domain guard the roll-call submit flow surfaces with its own message
 * (a stale/foreign-center `sessionId` — practically unreachable since this
 * screen resolves the session itself, but the use case still guards it). Mirrors
 * `enrollmentErrorCode` / `mapSessionWriteError`.
 */
export type RollCallErrorCode = 'session-not-found';

const CODES = new Set<string>(['session-not-found'] satisfies RollCallErrorCode[]);

/** Resolves a rejected `attendance.record` error to its stable code, or `null`
 *  for a validation or transport failure the caller should toast generically. */
export function rollCallErrorCode(error: unknown): RollCallErrorCode | null {
  const code = resolveDomainErrorCode(error);
  return code !== null && CODES.has(code) ? (code as RollCallErrorCode) : null;
}
