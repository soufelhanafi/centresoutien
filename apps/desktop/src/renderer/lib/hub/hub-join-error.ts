import { resolveDomainErrorCode } from '../ipc/resolve-domain-error-code';

/**
 * The reasons a `hub.joinCenter` call can fail, each mapped to its own localized
 * message. The three specific join failures are separated because they need three
 * different actions from the director: `center-join-unauthorized` means retype the
 * pairing code, `center-join-unreachable` means fix the network (host asleep,
 * firewall, different Wi-Fi), and `center-join-wrong-center` means they picked the
 * wrong center off the list. `center-join-failed` remains the catch-all for a
 * local/disk failure; `plan-feature-unavailable` is the shared `sync.multi-device`
 * gate (it should not normally surface at first-run, where the channel is
 * allow-listed). Anything else falls through to `unknown`.
 */
export type JoinCenterErrorCode =
  | 'center-join-failed'
  | 'center-join-unreachable'
  | 'center-join-unauthorized'
  | 'center-join-wrong-center'
  | 'plan-feature-unavailable'
  | 'unknown';

const KNOWN = new Set<string>([
  'center-join-failed',
  'center-join-unreachable',
  'center-join-unauthorized',
  'center-join-wrong-center',
  'plan-feature-unavailable',
]);

export function joinCenterErrorCode(error: unknown): JoinCenterErrorCode {
  const code = resolveDomainErrorCode(error);
  return code !== null && KNOWN.has(code) ? (code as JoinCenterErrorCode) : 'unknown';
}
