import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE_NAME = 'hub-client-config.json';

/**
 * The persisted "this device joined center X, hosted elsewhere" record (SOU-318).
 * One entry per local `centreId`: the hub's LAN URL and the pairing token this
 * device presents. The symmetric counterpart to {@link HubHostConfigStore} — a
 * hub HOST records how it serves; a client records which hub it follows.
 */
export type HubClientConfig = {
  readonly baseUrl: string;
  readonly token: string;
};

type ConfigFile = Record<string, HubClientConfig>;

function isHubClientConfig(value: unknown): value is HubClientConfig {
  if (value === null || typeof value !== 'object') return false;
  const config = value as Record<string, unknown>;
  return (
    typeof config['baseUrl'] === 'string' &&
    isHttpUrl(config['baseUrl']) &&
    typeof config['token'] === 'string' &&
    config['token'].length > 0
  );
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Unencrypted main-process store for a joined center's hub-client config
 * (SOU-318). Lives under `userData`, NOT in the center's SQLCipher DB, because
 * "which hub this device follows" is a per-DEVICE fact, not synced center data —
 * mirroring {@link HubHostConfigStore} and {@link LocalePreferenceStore}. Read
 * synchronously at boot so a joined center resumes syncing with no async gap.
 */
export class HubClientConfigStore {
  private readonly filePath: string;

  constructor(private readonly userDataDir: string) {
    this.filePath = join(userDataDir, FILE_NAME);
  }

  read(centreId: string): HubClientConfig | null {
    const config = this.readAll()[centreId];
    return config && isHubClientConfig(config) ? config : null;
  }

  write(centreId: string, config: HubClientConfig): void {
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
      return {};
    }
  }

  private persist(all: ConfigFile): void {
    mkdirSync(this.userDataDir, { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(all, null, 2));
    renameSync(tmpPath, this.filePath);
  }
}
