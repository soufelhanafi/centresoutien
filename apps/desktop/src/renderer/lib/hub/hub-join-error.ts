import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * The reasons a `hub.joinCenter` call can fail, each mapped to its own localized
 * message. `center-join-failed` is the domain error the use case throws for a bad
 * token / unreachable host / wrong center; `plan-feature-unavailable` is the
 * shared `sync.multi-device` gate (it should not normally surface at first-run,
 * where the channel is allow-listed). Anything else falls through to `unknown`.
 */
export type JoinCenterErrorCode = 'center-join-failed' | 'plan-feature-unavailable' | 'unknown';

const KNOWN = new Set<string>(['center-join-failed', 'plan-feature-unavailable']);

export function joinCenterErrorCode(error: unknown): JoinCenterErrorCode {
  const code = resolveDomainErrorCode(error);
  return code !== null && KNOWN.has(code) ? (code as JoinCenterErrorCode) : 'unknown';
}
