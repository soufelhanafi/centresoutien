/**
 * Transport-level failures of the HTTP {@link SyncHubPort} adapter (SOU-90) —
 * the embedded LAN hub is unreachable, rejects the pairing token, or answers
 * with a malformed/error payload. These are distinct from the domain-level
 * protocol results: a `rejected-stale` push is a NORMAL hub answer (a race the
 * engine retries), and a `SchemaTooOldError` is a version handshake, both
 * carried on the port. `HubTransportError` is the "the wire itself broke"
 * class: the renderer maps it to a "réessayer / vérifiez la connexion" state,
 * and the sync engine propagates it unchanged (per the `SyncHubPort` doc) so
 * nothing is mis-marked synced when no round-trip happened.
 */
export type HubTransportErrorCode = 'unreachable' | 'unauthorized' | 'bad-response';

export class HubTransportError extends Error {
  readonly code: HubTransportErrorCode;

  constructor(code: HubTransportErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'HubTransportError';
    this.code = code;
  }
}
