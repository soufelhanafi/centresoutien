import type { DiscoveredHubView } from './hub-gateway';

/**
 * A normalized join destination — the two entry paths (a center found by LAN
 * discovery, or one typed in manually when discovery finds nothing) collapse to
 * the same shape the `hub.joinCenter` request needs: a base URL, the center code,
 * and a human label for the confirm/progress screens.
 */
export type JoinTarget = {
  baseUrl: string;
  centerCode: string;
  label: string;
};

export function targetFromDiscovered(center: DiscoveredHubView): JoinTarget {
  return {
    baseUrl: `http://${center.host}:${center.port}`,
    centerCode: center.centerCode,
    label: center.name,
  };
}

export function targetFromManual(input: { host: string; port: number; centerCode: string }): JoinTarget {
  return {
    baseUrl: `http://${input.host}:${input.port}`,
    centerCode: input.centerCode,
    label: input.host,
  };
}
