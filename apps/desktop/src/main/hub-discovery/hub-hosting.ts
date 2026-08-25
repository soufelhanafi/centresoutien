import type { HubHostConfig } from '../infra/hub-host-config-store';
import { DEFAULT_HUB_PORT } from '../../shared/hub';
import { generatePairingToken } from './hub-service';

export { DEFAULT_HUB_PORT };

/** What the "Host this center" surface shows: whether this device hosts the open
 *  center and, if so, the address + token a joining laptop needs. */
export type HubHostingStatus =
  | { readonly hosting: false }
  | { readonly hosting: true; readonly address: string; readonly port: number; readonly token: string };

/** Read/write access to ONE center's hosting config (already bound to a centreId
 *  by the caller), so this service never sees a center id and can't cross tenants. */
export type HubHostingConfigAccess = {
  read(): HubHostConfig | null;
  write(config: HubHostConfig): void;
  clear(): void;
};

export type HubHostingDeps = {
  readonly config: HubHostingConfigAccess;
  /** Resolves this machine's private LAN IPv4, or null when it has none. */
  readonly resolveBindHost: () => string | null;
  /** CSPRNG bytes for the pairing token — injected for deterministic tests. */
  readonly randomBytes: (size: number) => Uint8Array;
  readonly defaultPort?: number;
};

/** Raised when hosting is requested on a machine with no reachable LAN interface —
 *  a hub nobody could reach is worse than a clear error. */
export class HubNoLanInterfaceError extends Error {
  constructor() {
    super('this device has no private LAN interface to host a hub on');
    this.name = 'HubNoLanInterfaceError';
  }
}

/**
 * Turns the open center's hosting on and off (SOU-318). Designating a host is a
 * config write, not a live server start: the embedded hub + its mDNS
 * advertisement come up from this config on the next boot (like a restore), so the
 * IPC caller pairs `enable`/`disable` with a restart. Enabling is idempotent and
 * TOKEN-STABLE — re-enabling an already-hosted center returns the existing token
 * rather than rotating it, so a laptop that already paired keeps working.
 */
export class HubHostingService {
  constructor(private readonly deps: HubHostingDeps) {}

  status(): HubHostingStatus {
    return toStatus(this.deps.config.read());
  }

  enable(): HubHostingStatus {
    const existing = this.deps.config.read();
    if (existing !== null) return toStatus(existing);

    const bindHost = this.deps.resolveBindHost();
    if (bindHost === null) throw new HubNoLanInterfaceError();

    const config: HubHostConfig = {
      port: this.deps.defaultPort ?? DEFAULT_HUB_PORT,
      bindHost,
      token: generatePairingToken(this.deps.randomBytes),
    };
    this.deps.config.write(config);
    return toStatus(config);
  }

  disable(): void {
    this.deps.config.clear();
  }
}

function toStatus(config: HubHostConfig | null): HubHostingStatus {
  return config === null
    ? { hosting: false }
    : { hosting: true, address: config.bindHost, port: config.port, token: config.token };
}
