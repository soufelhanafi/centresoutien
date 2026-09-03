import type { DiscoveredHubView } from './hub-gateway';

/**
 * A normalized join destination — the two entry paths (a center found by LAN
 * discovery, or one typed in manually when discovery finds nothing) collapse to
 * the same shape the `hub.joinCenter` request needs: the candidate base URLs, the
 * center code, and a human label for the confirm/progress screens.
 *
 * `baseUrls` is a list because a discovered hub advertises every IPv4 of its host
 * machine while binding only one of them; the join tries them in order. Manual
 * entry produces a single-element list, so both paths share one shape.
 */
export type JoinTarget = {
  baseUrls: readonly string[];
  centerCode: string;
  label: string;
};

export function targetFromDiscovered(center: DiscoveredHubView): JoinTarget {
  return {
    baseUrls: center.hosts.map((host) => `http://${host}:${center.port}`),
    centerCode: center.centerCode,
    label: center.name,
  };
}

export function targetFromManual(input: { host: string; port: number; centerCode: string }): JoinTarget {
  return {
    baseUrls: [`http://${input.host}:${input.port}`],
    centerCode: input.centerCode,
    label: input.host,
  };
}
