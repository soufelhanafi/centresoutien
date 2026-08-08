/// <reference types="vite/client" />
import { app } from 'electron';
import type { CenterCode } from '@centresoutien/domain';
import { SqliteHubStore } from '../data/sqlite/hub/hub-store';
import { applyMigrations, toMigrations } from '../data/sqlite/migration-runner';
import { HubServer } from './hub-server/hub-server';
import { SystemClock } from './infra/system-clock';
import { E2E_FIXED_DB_KEY } from './key-store';

/**
 * Standalone bare hub (SOU-82) — a hub-only process for the multi-laptop E2E.
 *
 * The two device app instances the E2E drives sync against a hub that is neither
 * a third app window nor embedded in one of them (KICKOFF decision 1): it is a
 * bare {@link HubServer} over a canonical {@link SqliteHubStore}, exactly the
 * SOU-90 integration-test shape, but run here as its OWN process so the two apps
 * are genuine independent replicas.
 *
 * Why an Electron main and not a plain Node script: `better-sqlite3-multiple-
 * ciphers` is NAN-based, so its single compiled `.node` is ABI-specific and the
 * E2E build targets Electron's ABI (`native-abi.mjs electron`). A plain-Node
 * process — the Playwright worker, or a `fork`ed script — could not load it. An
 * Electron main with no window shares the app instances' ABI and stays a bare
 * mailbox: it opens no `BrowserWindow`, runs no domain or renderer, just serves
 * the hub HTTP protocol on loopback.
 *
 * This entry is compiled ONLY into the `--mode e2e` build (electron.vite.config),
 * so it never ships in a release binary. The `__CS_E2E__` guard is belt-and-braces.
 */
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`hub-standalone: ${name} is required`);
  return value;
}

function resolveConfig(): {
  port: number;
  bindHost: string;
  token: string;
  centreId: string;
  centerCode: CenterCode;
  key: string;
  dir: string;
} {
  const rawPort = requiredEnv('CS_HUB_STANDALONE_PORT');
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`hub-standalone: invalid CS_HUB_STANDALONE_PORT "${rawPort}"`);
  }
  return {
    port,
    bindHost: process.env['CS_HUB_BIND_HOST'] ?? '127.0.0.1',
    token: requiredEnv('CS_HUB_TOKEN'),
    centreId: process.env['CS_CENTRE'] ?? 'local',
    centerCode: (process.env['CS_CENTER_CODE'] ?? 'CS-DEV-001') as CenterCode,
    key: process.env['CS_DB_KEY'] ?? E2E_FIXED_DB_KEY,
    dir: app.getPath('userData'),
  };
}

const hubMigrationFiles = import.meta.glob('../data/sqlite/hub/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

let store: SqliteHubStore | null = null;
let server: HubServer | null = null;

app.whenReady().then(async () => {
  try {
    if (!__CS_E2E__) {
      app.exit(0);
      return;
    }
    const config = resolveConfig();
    const clock = new SystemClock();
    store = SqliteHubStore.open({ centreId: config.centreId, key: config.key, dir: config.dir }, clock);
    applyMigrations(store.db, toMigrations(hubMigrationFiles));
    store.registerCenter(config.centerCode, config.token, clock.now());
    server = new HubServer(store, config.port, config.bindHost);
    const bound = await server.start();
    // The E2E launcher waits on this line before pointing the app instances here.
    console.info(`[hub-standalone] listening on ${config.bindHost}:${bound}`);
  } catch (error) {
    // whenReady()'s own rejection handler can't see errors thrown in here —
    // without this, a bad config or a bind failure hangs the launcher's
    // waitForHub poll for its full timeout instead of failing fast.
    console.error('[hub-standalone] failed to start', error);
    app.exit(1);
  }
});

app.on('will-quit', () => {
  if (server && store) {
    const closing = store;
    void server.stop().finally(() => closing.close());
  } else if (store) {
    store.close();
  }
  server = null;
  store = null;
});
