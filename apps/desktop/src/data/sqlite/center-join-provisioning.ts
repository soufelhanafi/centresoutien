import { existsSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Database as DB } from 'better-sqlite3';
import {
  CenterJoinError,
  DuplicateMatcher,
  SyncEngine,
  type CenterJoinProvisioningPort,
  type Clock,
  type IdGenerator,
  type JoinCenterFromHubInput,
  type JoinCenterFromHubResult,
  type PlanPolicy,
  type UserId,
} from '@centresoutien/domain';
import { centreDbFileName, openDatabaseAt } from './db';
import { applyMigrations, type Migration } from './migration-runner';
import { readOrCreateDeviceOrigin } from './device-origin';
import { SqliteChangeLogWriter } from './change-log/sqlite-change-log-writer';
import { SqliteLocalSyncRepository } from './change-log/sqlite-sync-local-repository';
import { SqliteDuplicateMatchSource } from './change-log/sqlite-duplicate-match-source';
import { SqliteCenterRepository } from './repositories/center-repository';
import { HttpSyncHubClient } from '../sync/http-sync-hub-client';
import type { CenterKeyProvider } from './center-directory';

/** Backstop against a pathological feed: a normal cold bootstrap converges in one
 *  or a handful of runs (each `run` applies the next batch until none remain). */
const MAX_BOOTSTRAP_RUNS = 1000;

/** Persists / clears which hub a joined center follows (bound elsewhere to the
 *  local `centreId`). Kept as a tiny seam so the adapter never imports the
 *  main-process config store directly. */
export type HubClientConfigWriter = {
  write(centreId: string, config: { baseUrl: string; token: string }): void;
  clear(centreId: string): void;
};

export type CenterJoinProvisioningDeps = {
  /** userData dir holding the `centre-*.db` files. */
  readonly dir: string;
  /** Derives the SQLCipher key for a `centreId` — a joined center's key is derived
   *  from the same keychain master as every other center (SOU-179). */
  readonly keyFor: CenterKeyProvider;
  readonly migrations: readonly Migration[];
  readonly clock: Clock;
  readonly ids: IdGenerator;
  /** The active plan — the sync engine re-checks `sync.multi-device` on every run. */
  readonly plan: PlanPolicy;
  readonly clientConfig: HubClientConfigWriter;
  /** Stamped as `updatedBy` on any conflict resolution during the pull; a clean
   *  cold bootstrap writes none, so this is a system placeholder. */
  readonly systemUserId: UserId;
};

/**
 * Joins an existing center by COLD-BOOTSTRAPPING a local replica from the hub feed
 * (SOU-318) — the pull-based counterpart to {@link SqliteCenterProvisioning}. It
 * allocates a fresh local `centreId`, opens + migrates a new encrypted
 * `centre-{centreId}.db`, then runs the real sync engine against the remote hub
 * with the pairing token until the whole feed is applied — reconstructing the
 * center identity, users, and data through the SOU-318 mappers. It VERIFIES the
 * reconstructed center matches the requested code, persists the hub-client config,
 * and publishes the DB atomically (temp file renamed only once complete), so a
 * failed join — bad token, unreachable hub, wrong/empty center — leaves nothing
 * discoverable behind. Switching into the joined center is the caller's job.
 */
export class SqliteCenterJoinProvisioning implements CenterJoinProvisioningPort {
  constructor(private readonly deps: CenterJoinProvisioningDeps) {}

  async provisionFromHub({ baseUrl, token, centerCode }: JoinCenterFromHubInput): Promise<JoinCenterFromHubResult> {
    const centreId = this.allocateCentreId();
    const finalFile = join(this.deps.dir, centreDbFileName(centreId));
    // The temp name does NOT match the switcher's `centre-*.db` scan, so a
    // concurrent list/switch can never open a center mid-join.
    const tempFile = `${finalFile}.joining`;
    if (existsSync(finalFile)) {
      throw new CenterJoinError(`a center database already exists at ${finalFile}`);
    }

    let db: DB | null = null;
    try {
      removeCenterFiles(tempFile);
      db = openDatabaseAt(tempFile, this.deps.keyFor(centreId));
      applyMigrations(db, [...this.deps.migrations]);
      await this.coldBootstrap(db, { baseUrl, token, centerCode });
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
      db = null;
      renameSync(tempFile, finalFile); // atomic publish: the center appears fully ready
      removeCenterFiles(tempFile);
      // Persist AFTER the DB is published so the switched-in container reads a hub
      // client for a center that is actually on disk.
      this.deps.clientConfig.write(centreId, { baseUrl, token });
      return { centreId, centerCode };
    } catch (error) {
      db?.close();
      removeCenterFiles(tempFile);
      this.deps.clientConfig.clear(centreId);
      throw error instanceof CenterJoinError ? error : new CenterJoinError(reasonFrom(error));
    }
  }

  async discard(centreId: string): Promise<void> {
    removeCenterFiles(join(this.deps.dir, centreDbFileName(centreId)));
    this.deps.clientConfig.clear(centreId);
  }

  private async coldBootstrap(
    db: DB,
    { baseUrl, token, centerCode }: JoinCenterFromHubInput,
  ): Promise<void> {
    const deviceOrigin = readOrCreateDeviceOrigin(db, this.deps.ids);
    const local = new SqliteLocalSyncRepository(db, this.deps.clock, deviceOrigin, centerCode);
    const matcher = new DuplicateMatcher(new SqliteDuplicateMatchSource(db));
    const engine = new SyncEngine({
      hub: new HttpSyncHubClient({ baseUrl, token }),
      local,
      clock: this.deps.clock,
      plan: this.deps.plan,
      deviceId: deviceOrigin,
      updatedBy: this.deps.systemUserId,
      centreId: centerCode,
      userCanResolve: true,
      subjectCollisionStore: local,
      sessionDedupStore: local,
      paymentReversalDedupStore: local,
    });

    // Drain the whole feed: each run applies the next batch and advances the
    // cursor; a run that applies nothing means we are caught up.
    for (let run = 0; run < MAX_BOOTSTRAP_RUNS; run += 1) {
      const result = await engine.run(matcher);
      if (result.status !== 'synced') {
        throw new CenterJoinError('the initial sync did not converge');
      }
      if (result.applied === 0) break;
    }

    const changeLog = new SqliteChangeLogWriter(db, this.deps.clock, deviceOrigin);
    const center = await new SqliteCenterRepository(db, changeLog).get();
    if (center === null) {
      throw new CenterJoinError('the hub returned no center for this pairing token');
    }
    if (center.centerCode !== centerCode) {
      throw new CenterJoinError(`the hub served a different center (${center.centerCode})`);
    }
  }

  /**
   * A fresh, collision-free DB-file discriminator: the bare ULID of a generated
   * id. ULIDs are globally unique without a server, so two laptops joining offline
   * never pick the same filename. Independent of the host's own discriminator.
   */
  private allocateCentreId(): string {
    const generated = this.deps.ids.next('ctr');
    const separator = generated.indexOf('_');
    return separator >= 0 ? generated.slice(separator + 1) : generated;
  }
}

/**
 * Removes a SQLCipher DB file and its WAL/SHM sidecars, best-effort. A leftover
 * temp/discarded file is harmless once it no longer carries the discoverable
 * `centre-{id}.db` name, so a failed unlink is swallowed rather than masking the
 * original error the caller is already surfacing.
 */
function removeCenterFiles(file: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      rmSync(`${file}${suffix}`, { force: true });
    } catch {
      // Best effort — see the doc above.
    }
  }
}

function reasonFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
