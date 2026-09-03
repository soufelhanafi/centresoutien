import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import { join } from 'node:path';

const FILE_NAME = 'hub-host-config.json';

/**
 * The persisted "this device hosts center X" record (SOU-318). One entry per
 * `centreId`, so a machine can host more than one center: the LAN interface it
 * serves on, the TCP port, and the per-center pairing token a joining device must
 * present.
 */
export type HubHostConfig = {
  readonly port: number;
  readonly bindHost: string;
  readonly token: string;
};

type ConfigFile = Record<string, HubHostConfig>;

function isHubHostConfig(value: unknown): value is HubHostConfig {
  if (value === null || typeof value !== 'object') return false;
  const config = value as Record<string, unknown>;
  return (
    typeof config['port'] === 'number' &&
    Number.isInteger(config['port']) &&
    config['port'] >= 1 &&
    config['port'] <= 65535 &&
    typeof config['bindHost'] === 'string' &&
    config['bindHost'].length > 0 &&
    typeof config['token'] === 'string' &&
    config['token'].length > 0
  );
}

/**
 * Unencrypted main-process store for hub-hosting config (SOU-318). Lives directly
 * under Electron's `userData` dir, NOT inside a center's SQLCipher DB, because it
 * is a per-DEVICE role decision ("this laptop is the hub for center X"), not
 * center data that syncs — mirroring {@link LocalePreferenceStore}. The pairing
 * token is a LAN-scoped shared secret, not a credential protecting data at rest
 * (SQLCipher already does that), so it lives here in plaintext like the token the
 * `CS_HUB_TOKEN` dev override supplied.
 *
 * `read` is synchronous by design: boot resolves a center's hub config before the
 * container is built, with no async gap to await.
 */
export class HubHostConfigStore {
  private readonly filePath: string;

  constructor(private readonly userDataDir: string) {
    this.filePath = join(userDataDir, FILE_NAME);
  }

  read(centreId: string): HubHostConfig | null {
    const config = this.readAll()[centreId];
    return config && isHubHostConfig(config) ? config : null;
  }

  write(centreId: string, config: HubHostConfig): void {
    const all = this.readAll();
    all[centreId] = config;
    this.persist(all);
  }

  clear(centreId: string): void {
    const all = this.readAll();
    if (!(centreId in all)) return;
    delete all[centreId];
    this.persist(all);
  }

  private readAll(): ConfigFile {
    if (!existsSync(this.filePath)) return {};
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.filePath, 'utf-8'));
      return parsed !== null && typeof parsed === 'object' ? (parsed as ConfigFile) : {};
    } catch {
      // Missing, unreadable, or corrupted — treat as "no device hosts anything".
      return {};
    }
  }

  private persist(all: ConfigFile): void {
    mkdirSync(this.userDataDir, { recursive: true });
    // Write-then-rename: a crash mid-write can only strand the .tmp file, never
    // truncate the config itself — rename is atomic on the same filesystem.
    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(all, null, 2));
    renameSync(tmpPath, this.filePath);
  }
}

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

/** The only fields the selection actually looks at — narrower than
 *  {@link NetworkInterfaceInfo} so a test can build fixtures without the
 *  unrelated `mac`/`netmask`/`cidr` fields real adapters also carry. */
type MinimalInterfaceInfo = Pick<NetworkInterfaceInfo, 'family' | 'address' | 'internal'>;

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
 * Whether `address` is still one of this machine's current non-internal IPv4
 * interfaces (SOU-318). A stored hosting `bindHost` can go stale after a network
 * change; boot uses this to re-resolve rather than bind an interface that no
 * longer exists (which would fail silently while the UI still reads "hosting").
 */
export function isActiveLanAddress(address: string): boolean {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const info of addresses ?? []) {
      if (info.family === 'IPv4' && !info.internal && info.address === address) return true;
    }
  }
  return false;
}

/**
 * Whether `address` is one this machine would still CHOOSE to host on — live, and
 * on an adapter {@link pickLanBindHost} would not skip.
 *
 * Stricter than {@link isActiveLanAddress} on purpose. A `bindHost` chosen before
 * the virtual-adapter denylist existed stays live indefinitely (the Docker bridge
 * or VPN tunnel it names is still up), so a liveness-only check would keep serving
 * an address nothing else in the room can reach and never re-resolve. Boot uses
 * this so a config poisoned by an older build heals itself on the next launch
 * instead of waiting for the human to disable and re-enable hosting.
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
