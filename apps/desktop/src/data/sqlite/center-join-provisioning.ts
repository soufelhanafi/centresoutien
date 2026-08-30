import { existsSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Database as DB } from 'better-sqlite3';
import {
  CenterJoinError,
  DuplicateMatcher,
  SyncEngine,
  newCenterTrial,
  type CenterJoinProvisioningPort,
  type Clock,
  type IdGenerator,
  type JoinCenterFromHubInput,
  type JoinCenterFromHubResult,
  type PlanPolicy,
  type UserId,
} from '@centresoutien/domain';
import { centreDbFileName, openDatabaseAt } from './db';
import { recoveryBlobPathFor } from './recovery-blob-path';
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
  /** Whether this machine already holds a valid license — a trial is seeded on the
   *  joined center only when it does NOT, so an unlicensed second machine can use
   *  the center it just joined during the trial window (a license is machine-scoped
   *  and per-device, never synced). */
  readonly hasActiveLicense: () => boolean;
  readonly clientConfig: HubClientConfigWriter;
  /** Stamped as `updatedBy` on any conflict resolution during the pull; a clean
   *  cold bootstrap writes none, so this is a system placeholder. */
  readonly systemUserId: UserId;
  /**
   * Optional progress callback (45-minute-onboarding follow-up): forwarded to
   * the `SyncEngine` as `onPage`, so the join wizard can show real, moving
   * progress across a cold bootstrap's many pages instead of a spinner with no
   * feedback for however long that takes. Omit in tests that don't render UI.
   */
  readonly reportProgress?: (applied: number) => void;
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

  async provisionFromHub(input: JoinCenterFromHubInput): Promise<JoinCenterFromHubResult> {
    // The domain schema only shape-checks the URL (it compiles without `URL`);
    // parse it for real here and persist only the clean origin, so a stray
    // path/whitespace can never reach the HTTP client or the stored client config.
    const baseUrl = normalizeHubUrl(input.baseUrl);
    const { token, centerCode } = input;
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
      // Clean BOTH names: the temp file if we failed before publishing, AND the
      // final file if we failed AFTER the atomic rename (e.g. clientConfig.write
      // throwing) — otherwise a fully-populated, discoverable center DB holding
      // another center's real data would survive the failure. Both removals are
      // best-effort force-unlinks, so removing an absent name is a harmless no-op.
      removeCenterFiles(tempFile);
      removeCenterFiles(finalFile);
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
      ...(this.deps.reportProgress !== undefined ? { onPage: this.deps.reportProgress } : {}),
    });

    // Drain the whole feed: each run applies the next batch and advances the
    // cursor; a run that applies nothing means we are caught up. If the cap is
    // hit WITHOUT a zero-applied run (a pathological / constantly-changing hub),
    // the replica is not fully caught up — fail rather than publish a partial
    // center as "joined".
    let converged = false;
    for (let run = 0; run < MAX_BOOTSTRAP_RUNS; run += 1) {
      const result = await engine.run(matcher);
      if (result.status !== 'synced') {
        throw new CenterJoinError('the initial sync did not converge');
      }
      if (result.applied === 0) {
        converged = true;
        break;
      }
    }
    if (!converged) {
      throw new CenterJoinError(`the initial sync did not converge within ${MAX_BOOTSTRAP_RUNS} passes`);
    }

    const changeLog = new SqliteChangeLogWriter(db, this.deps.clock, deviceOrigin);
    const center = await new SqliteCenterRepository(db, changeLog).get();
    if (center === null) {
      throw new CenterJoinError('the hub returned no center for this pairing token');
    }
    if (center.centerCode !== centerCode) {
      throw new CenterJoinError(`the hub served a different center (${center.centerCode})`);
    }

    // The trial is device-local (never synced), so a pulled center has none. Seed
    // one when this machine holds no license, so the joined center is usable now
    // rather than landing straight on the activation screen.
    if (!this.deps.hasActiveLicense()) {
      const trial = newCenterTrial(this.deps.clock.now());
      db.prepare(
        `INSERT INTO center_trial (singleton, started_at, last_seen_at)
         VALUES (1, ?, ?)
         ON CONFLICT(singleton) DO NOTHING`,
      ).run(trial.startedAt.toISOString(), trial.lastSeenAt.toISOString());
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
 * Removes a SQLCipher DB file, its WAL/SHM sidecars, AND its SOU-302 `.recovery`
 * escrow sibling, best-effort. A leftover temp/discarded file is harmless once it
 * no longer carries the discoverable `centre-{id}.db` name, so a failed unlink is
 * swallowed rather than masking the original error the caller is already
 * surfacing. Including the `.recovery` sibling keeps a discarded/failed join from
 * leaving a stale sealed-key blob behind — the switch-in that fails a join can
 * have already sealed one for the just-joined center (mirrors
 * {@link SqliteCenterProvisioning}).
 */
function removeCenterFiles(file: string): void {
  const targets = [file, `${file}-wal`, `${file}-shm`, recoveryBlobPathFor(file)];
  for (const target of targets) {
    try {
      rmSync(target, { force: true });
    } catch {
      // Best effort — see the doc above.
    }
  }
}

/**
 * Parses + normalizes a hub URL to its bare origin (scheme + host + port), or
 * throws {@link CenterJoinError}. Enforces http(s) and drops any path/query/hash,
 * so only a clean base URL ever reaches {@link HttpSyncHubClient} (which builds
 * request paths by string concatenation) or the persisted client config.
 */
function normalizeHubUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new CenterJoinError('the hub address is not a valid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new CenterJoinError('the hub address must be an http(s) URL');
  }
  return parsed.origin;
}

function reasonFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
