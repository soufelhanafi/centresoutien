import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';

/**
 * Which of this machine's addresses the embedded hub should serve on (SOU-318).
 *
 * Split out of the hosting-config store: that file's job is persisting a small
 * JSON record, while this one answers a network question with its own rules and
 * its own test surface. The join side has the mirror-image problem — ranking the
 * addresses a REMOTE hub advertised — and lives in
 * `main/hub-discovery/hub-candidates.ts`.
 */

/**
 * Name patterns for adapters that carry a private IPv4 but are never the WiFi/
 * Ethernet LAN a second laptop is actually on: container bridges (Docker's
 * default `172.17.0.0/16` falls inside our RFC-1918 check), hypervisor host-only
 * networks (VirtualBox, VMware, Hyper-V), and VPN/mesh tunnels (WireGuard,
 * Tailscale, ZeroTier, generic tun/tap). `Object.entries(networkInterfaces())`
 * has no concept of "the real LAN adapter" and OS-dependent enumeration order —
 * a director running Docker Desktop or a VPN client can have one of these listed
 * before the WiFi adapter, so picking the first private IPv4 unconditionally
 * binds/advertises an address nothing else in the room can reach (reported as
 * "connexion failed" on the joining laptop despite a correct pairing code).
 */
const VIRTUAL_INTERFACE_NAME_PATTERN =
  /docker|veth|virbr|virtualbox|vboxnet|vmnet|vmware|hyper-v|vethernet|zerotier|tailscale|wireguard|^wg\d|^tun\d|^tap\d|^utun\d|loopback/i;

/** The only fields the selection actually looks at — narrower than
 *  {@link NetworkInterfaceInfo} so a test can build fixtures without the
 *  unrelated `mac`/`netmask`/`cidr` fields real adapters also carry. */
export type MinimalInterfaceInfo = Pick<NetworkInterfaceInfo, 'family' | 'address' | 'internal'>;

/**
 * The LAN IPv4 address other laptops reach this hub on. Prefers the first
 * non-internal, non-virtual IPv4 in a private range (RFC 1918); falls back to a
 * virtual-adapter one only if that's the sole private IPv4 available, so a
 * machine whose only network is a VM host-only adapter can still host rather
 * than being refused outright. Returns `null` when the machine has no private
 * IPv4 at all (offline / VPN-only) — the caller then cannot host, which is
 * correct: a hub with no LAN interface is unreachable by design.
 *
 * Wildcard binds (`0.0.0.0` / `::`) are deliberately never returned — CLAUDE.md
 * §security requires the hub to serve a specific LAN interface, never expose
 * itself beyond the local network.
 */
export function resolveLanBindHost(): string | null {
  return pickLanBindHost(networkInterfaces());
}

/** Extracted for unit testing against a synthetic interface map (real hardware
 *  gives no control over adapter names or enumeration order). */
export function pickLanBindHost(interfaces: NodeJS.Dict<readonly MinimalInterfaceInfo[]>): string | null {
  let virtualFallback: string | null = null;
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal || !isPrivateIpv4(address.address)) continue;
      if (VIRTUAL_INTERFACE_NAME_PATTERN.test(name)) {
        virtualFallback ??= address.address;
        continue;
      }
      return address.address;
    }
  }
  return virtualFallback;
}

/**
 * Whether `address` is one this machine would still CHOOSE to host on — live, and
 * on an adapter {@link pickLanBindHost} would not skip.
 *
 * A `bindHost` chosen before the virtual-adapter denylist existed stays live
 * indefinitely (the Docker bridge or VPN tunnel it names is still up), so a
 * liveness-only check would keep serving an address nothing else in the room can
 * reach and never re-resolve. Boot uses this so a config poisoned by an older
 * build heals itself on the next launch instead of waiting for the human to
 * disable and re-enable hosting.
 */
export function isPreferredLanAddress(address: string): boolean {
  return isPreferredLanAddressIn(networkInterfaces(), address);
}

/** Extracted for unit testing against a synthetic interface map, like
 *  {@link pickLanBindHost}. */
export function isPreferredLanAddressIn(
  interfaces: NodeJS.Dict<readonly MinimalInterfaceInfo[]>,
  address: string,
): boolean {
  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const info of addresses ?? []) {
      if (info.family !== 'IPv4' || info.internal || info.address !== address) continue;
      // Deliberately NOT "is this exactly what the picker would return now": a
      // machine with both Ethernet and Wi-Fi has two equally reachable addresses,
      // and rewriting to the picker's favourite on every boot would move the
      // pairing address a director already wrote down, for no gain.
      return !VIRTUAL_INTERFACE_NAME_PATTERN.test(name) && isPrivateIpv4(address);
    }
  }
  return false;
}

function isPrivateIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  const [first, second] = octets as [number, number, number, number];
  if (first === 10) return true;
  if (first === 192 && second === 168) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  return false;
}
