import {
  CenterJoinError,
  CenterJoinUnauthorizedError,
  CenterJoinUnreachableError,
  type CenterCode,
  type DeviceId,
} from '@centresoutien/domain';
import { HttpSyncHubClient } from '../sync/http-sync-hub-client';
import { HubTransportError } from '../sync/hub-transport-error';

/**
 * Choosing WHICH advertised address a join actually talks to (SOU-318).
 *
 * Split out of the join provisioner: that file owns the cold bootstrap (open,
 * migrate, drain the feed, publish atomically), while picking a live address is
 * a separate network concern with its own failure vocabulary. Ranking the
 * candidates beforehand is the discovery side's job
 * (`main/hub-discovery/hub-candidates.ts`); this module is what proves one of
 * them answers.
 */

/**
 * How long one candidate address gets to answer the reachability probe. A hub on
 * the same WiFi answers a cursor read in milliseconds, so seconds is already
 * generous — and the budget is per candidate, so it has to stay small enough that
 * walking a handful of dead addresses (a firewall that DROPS never answers at all)
 * still fails fast rather than stranding the joining laptop's screen for minutes.
 */
const PROBE_TIMEOUT_MS = 3_000;

/** The device the reachability probe reads a cursor for. A cursor read is a pure
 *  SELECT on the hub — an unknown device simply has none — so probing under a
 *  fixed placeholder writes nothing and cannot disturb a real device's cursor. */
const JOIN_PROBE_DEVICE_ID = 'join-probe' as DeviceId;

/**
 * The first candidate address whose hub answers, or a failure that names WHY.
 *
 * mDNS advertises every non-internal IPv4 of the host machine while the hub binds
 * exactly one of them, so the address a responder lists first is not reliably the
 * one that serves. Each candidate is probed with the cheapest authenticated call
 * the protocol has — a cursor read, one O(1) SELECT on the hub with no feed and no
 * write — which separates the three outcomes a joining director needs told apart:
 * answered (use it), rejected the token (stop now; every other address of that hub
 * would reject it too), silent (try the next).
 */
export async function resolveReachableHub(
  candidates: readonly string[],
  token: string,
  centerCode: CenterCode,
): Promise<string> {
  for (const baseUrl of candidates) {
    const client = new HttpSyncHubClient({ baseUrl, token, timeoutMs: PROBE_TIMEOUT_MS });
    try {
      await client.getCursor(JOIN_PROBE_DEVICE_ID, centerCode);
      return baseUrl;
    } catch (error) {
      if (error instanceof HubTransportError && error.code === 'unauthorized') {
        throw new CenterJoinUnauthorizedError(baseUrl);
      }
      // Anything else (unreachable, or a hub that answered oddly) — the hub at
      // THIS address is not usable; fall through to the next candidate. A
      // non-transport answer still proves something is listening, but only a
      // clean cursor read proves it is a hub that will serve this center.
    }
  }
  throw new CenterJoinUnreachableError(candidates);
}

/**
 * Parses + normalizes a hub URL to its bare origin (scheme + host + port), or
 * throws {@link CenterJoinError}. Enforces http(s) and drops any path/query/hash,
 * so only a clean base URL ever reaches {@link HttpSyncHubClient} (which builds
 * request paths by string concatenation) or the persisted client config.
 */
export function normalizeHubUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new CenterJoinError('the hub address is not a valid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new CenterJoinError('the hub address must be an http(s) URL');
  }
  return parsed.origin;
}
