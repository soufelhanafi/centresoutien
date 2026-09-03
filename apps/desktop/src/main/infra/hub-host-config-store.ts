import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
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
