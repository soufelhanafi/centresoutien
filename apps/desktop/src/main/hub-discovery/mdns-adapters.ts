import { Bonjour, type Service } from 'bonjour-service';
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
      const browser = this.bonjour.find({ type: HUB_MDNS_TYPE }, (service: Service) => {
        const hub = toDiscoveredHub(service);
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
function toDiscoveredHub(service: Service): DiscoveredHub | null {
  const txt = decodeHubTxt(service.txt);
  if (txt === null) return null;
  const host = pickIpv4(service.addresses) ?? (service.host || null);
  if (host === null) return null;
  return {
    name: txt.name,
    host,
    port: service.port,
    centreId: txt.centreId,
    centerCode: txt.centerCode,
  };
}

function pickIpv4(addresses: readonly string[] | undefined): string | null {
  for (const address of addresses ?? []) {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(address)) return address;
  }
  return null;
}
