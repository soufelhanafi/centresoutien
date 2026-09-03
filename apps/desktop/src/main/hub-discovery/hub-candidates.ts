import type { NetworkInterfaceInfo } from 'node:os';

/** The only fields the ranking reads — narrower than {@link NetworkInterfaceInfo}
 *  so a test can build fixtures without the unrelated `mac`/`cidr` fields. */
export type LocalInterfaceAddress = Pick<NetworkInterfaceInfo, 'address' | 'netmask' | 'family' | 'internal'>;

const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Orders the addresses a hub advertised by how likely each is to actually reach
 * it, best first.
 *
 * The responder advertises an A record for EVERY non-internal IPv4 on the host
 * machine, but the hub's HTTP listener binds exactly one of them. So the joining
 * laptop cannot trust the order the records arrive in — it has to rank them. The
 * strongest available signal is our own network: an address inside a subnet THIS
 * machine is also on is one we can actually route to, while the host's unplugged
 * Ethernet port, its container bridge, or a VPN tunnel is not. Private addresses
 * outrank public ones after that, since the hub is a LAN-only service by design.
 *
 * Link-local (169.254.x.x, a Windows adapter that never got a DHCP lease) and
 * loopback are dropped outright: they are never reachable from another machine,
 * and leaving them in would spend a connection timeout each on the joining
 * laptop's first-run screen.
 */
export function orderHubCandidates(
  advertised: readonly string[],
  localAddresses: readonly LocalInterfaceAddress[],
): readonly string[] {
  const reachableLocals = localAddresses.filter(
    (local) => local.family === 'IPv4' && !local.internal && IPV4_PATTERN.test(local.address),
  );
  const ranked = [...new Set(advertised)]
    .filter(isPlausibleHubAddress)
    .map((address) => ({ address, rank: rankOf(address, reachableLocals) }));
  // Stable sort: equally-ranked addresses keep the order the responder listed
  // them in, so this only ever reorders on evidence, never arbitrarily.
  return ranked.sort((left, right) => left.rank - right.rank).map((candidate) => candidate.address);
}

function isPlausibleHubAddress(address: string): boolean {
  if (!IPV4_PATTERN.test(address)) return false;
  const octets = toOctets(address);
  if (octets === null) return false;
  const [first, second] = octets;
  if (first === 127) return false;
  if (first === 0) return false;
  // 169.254.0.0/16 — an adapter that self-assigned because no DHCP answered.
  if (first === 169 && second === 254) return false;
  return true;
}

function rankOf(address: string, localAddresses: readonly LocalInterfaceAddress[]): number {
  if (localAddresses.some((local) => isSameSubnet(address, local))) return 0;
  return isPrivateIpv4(address) ? 1 : 2;
}

function isSameSubnet(address: string, local: LocalInterfaceAddress): boolean {
  const candidate = toUint32(address);
  const own = toUint32(local.address);
  const mask = toUint32(local.netmask);
  if (candidate === null || own === null || mask === null || mask === 0) return false;
  return (candidate & mask) === (own & mask);
}

function isPrivateIpv4(address: string): boolean {
  const octets = toOctets(address);
  if (octets === null) return false;
  const [first, second] = octets;
  if (first === 10) return true;
  if (first === 192 && second === 168) return true;
  return first === 172 && second >= 16 && second <= 31;
}

function toOctets(address: string): [number, number, number, number] | null {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4) return null;
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts as [number, number, number, number];
}

function toUint32(address: string): number | null {
  const octets = toOctets(address);
  if (octets === null) return null;
  const [first, second, third, fourth] = octets;
  // `>>> 0` keeps the result unsigned: the leading octet of a 10.x/172.x address
  // sets the sign bit under JS's signed 32-bit bitwise ops.
  return ((first << 24) | (second << 16) | (third << 8) | fourth) >>> 0;
}
