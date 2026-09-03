import { networkInterfaces } from 'node:os';
import { Bonjour, type Service } from 'bonjour-service';
import { orderHubCandidates, type LocalInterfaceAddress } from './hub-candidates';
import {
  HUB_MDNS_TYPE,
  decodeHubTxt,
  encodeHubTxt,
  type DiscoveredHub,
  type HubAdvertisement,
  type HubAdvertiserPort,
  type HubDiscovererPort,
  type HubTxtRecord,
} from './hub-service';

/**
 * The Bonjour/mDNS adapter (SOU-318) — the ONLY file that touches the multicast
 * network. It both advertises this device's hub and browses for others, sharing a
 * single `Bonjour` instance (one multicast socket per process). Constructed once
 * at boot in `index.ts` and injected as {@link HubAdvertiserPort} /
 * {@link HubDiscovererPort}, so composition-root and its tests stay network-free.
 * Every teardown call is wrapped: an mDNS socket hiccup on shutdown must never
 * take the process down.
 */
export class BonjourHubMdns implements HubAdvertiserPort, HubDiscovererPort {
  private readonly bonjour = new Bonjour();

  advertise(input: { name: string; port: number; txt: HubTxtRecord }): HubAdvertisement {
    const service = this.bonjour.publish({
      name: input.name,
      type: HUB_MDNS_TYPE,
      port: input.port,
      txt: encodeHubTxt(input.txt),
    });
    return {
      stop: () => {
        try {
          service.stop();
        } catch {
          // A withdraw that fails on shutdown is harmless — the record TTLs out.
        }
      },
    };
  }

  discover(timeoutMs: number): Promise<readonly DiscoveredHub[]> {
    return new Promise((resolve) => {
      const found = new Map<string, DiscoveredHub>();
      // Read once per browse, not per responder: the ranking compares every
      // advertised address against the networks THIS machine is on.
      const localAddresses = Object.values(networkInterfaces()).flatMap((addresses) => addresses ?? []);
      const browser = this.bonjour.find({ type: HUB_MDNS_TYPE }, (service: Service) => {
        const hub = toDiscoveredHub(service, localAddresses);
        if (hub !== null) found.set(`${hub.centreId}@${hub.host}:${hub.port}`, hub);
      });
      setTimeout(() => {
        try {
          browser.stop();
        } catch {
          // Best-effort stop; the browser is discarded either way.
        }
        resolve([...found.values()]);
      }, timeoutMs);
    });
  }

  destroy(): void {
    try {
      this.bonjour.destroy();
    } catch {
      // Best-effort teardown at app quit.
    }
  }
}

/** Narrows a Bonjour responder into a {@link DiscoveredHub}, or null when its TXT
 *  identity is missing/foreign or it advertised no usable IPv4. */
export function toDiscoveredHub(service: Service, localAddresses: readonly LocalInterfaceAddress[]): DiscoveredHub | null {
  const txt = decodeHubTxt(service.txt);
  if (txt === null) return null;
  const hosts = orderHubCandidates(service.addresses ?? [], localAddresses);
  // The SRV target is the last resort: a responder that advertised no usable A
  // record can still be reachable by its `.local` name where mDNS resolution works.
  const fallback = service.host || null;
  const candidates = hosts.length > 0 ? hosts : fallback === null ? [] : [fallback];
  const [host] = candidates;
  if (host === undefined) return null;
  return {
    name: txt.name,
    host,
    hosts: candidates,
    port: service.port,
    centreId: txt.centreId,
    centerCode: txt.centerCode,
  };
}
