import type { Clock } from '../ports/clock';
import { entityKey, type ChangeBatch, type SyncCursor, type SyncHubPort } from '../ports/sync-hub-port';
import type { PlanPolicy } from '../plans/plan-policy';
import { SchemaTooOldError, SyncProtocolError } from '../errors/sync-errors';
import type { CenterCode, DeviceId, UserId } from '../value-objects/ids';
import type { SyncConflict } from './conflicts';
import type { DuplicateMatcher } from './duplicate-matcher';
import { SCHEMA_VERSION } from './schema-version';
import { ChangeResolver } from './resolve-changes';
import type { LocalSyncRepository } from './sync-local-repository';
import type { SubjectCodeCollision, SubjectCodeCollisionStore } from './subject-code-collision';
import type { SessionDedup, SessionDedupStore } from './session-dedup';
import type { PaymentReversalDedupStore, ReversalDedup } from './reversal-dedup';
import type { UserCredentialDuplicate, UserCredentialDuplicateStore } from './user-credential-duplicate';

/**
 * The sync cycle: **pull → resolve → push** (SOU-80 §3). Every sync, in that
 * order, on every device:
 *
 * 1. Pull everything the hub accepted since this device's cursor.
 * 2. Resolve locally (`ChangeResolver`): non-overlapping field edits auto-merge
 *    silently, delete-vs-edit and same-field clashes go to a human, probable
 *    duplicates are flagged.
 * 3. Push. Each `LocalChange` carries the canonical `baseVersion` it was written
 *    on; the hub accepts iff every base equals its current canonical version,
 *    then assigns a fresh `version`. A stale push is rejected whole and the
 *    cycle re-runs — one cheap retry loop (capped at `MAX_SYNC_ATTEMPTS`)
 *    serializes concurrent syncs without locks. Resolution always happens on the
 *    device that syncs second; the others converge on their next pull.
 *
 * Ordering truth is `version` + the hub's atomic push check, never wall clocks.
 * A device whose clock is absurdly ahead is flagged (`deviceClockSkew`), and its
 * data still syncs — decided by versions, not timestamps.
 *
 * Transport failures (an unreachable HTTP hub) reject out of `run` and are not
 * retried here: SOU-81 adds a transport status to `SyncResult` when the embedded
 * hub lands, and `SchemaTooOldError` / `ImmutableDivergenceError` /
 * `PlanFeatureUnavailableError` always propagate unchanged.
 */
export const MAX_SYNC_ATTEMPTS = 5;
export const CLOCK_SKEW_THRESHOLD_MS = 15 * 60 * 1000;

export type SyncEngineInput = {
  hub: SyncHubPort;
  local: LocalSyncRepository;
  clock: Clock;
  /** Gate for `sync.multi-device` — the domain check is the only one that counts. */
  plan: PlanPolicy;
  deviceId: DeviceId;
  updatedBy: UserId;
  centreId: CenterCode;
  /**
   * `sync.conflict-resolution` permission. The engine never auto-resolves a
   * clash either way — this only decides whether the conflicts surface as an
   * interactive popup (`granted`) or queue into the "conflits en attente"
   * inbox for an admin (`queued`).
   */
  userCanResolve: boolean;
  /**
   * Subject-code clash reads/writes (SOU-122). When wired, a subject apply whose
   * code collides with a different live local subject is auto-resolved (lower
   * ULID keeps the code) instead of throwing the unique-index constraint. Omit
   * to fall back to plain applies (e.g. tests with no subject store).
   */
  subjectCollisionStore?: SubjectCodeCollisionStore;
  /**
   * Session natural-key clash reads/writes (SOU-188). When wired, a session
   * apply whose `(recurring_session_id, date)` collides with a different live
   * local session (two replicas materialized the same occurrence offline) is
   * settled deterministically (lower ULID wins, in-place rewrite) instead of
   * throwing `ux_sessions_recurrence_date`. Omit to fall back to plain applies.
   */
  sessionDedupStore?: SessionDedupStore;
  paymentReversalDedupStore?: PaymentReversalDedupStore;
  /**
   * User credential duplicate reads (SOU-258 follow-up). When wired, an inbound
   * `users` apply whose normalized username already belongs to a different live
   * local row (two laptops created the same account offline, migration 0053) is
   * surfaced on the result so the UI can nudge a password reset — the shadowed
   * credential no longer authenticates. Detection only; no behaviour change.
   */
  userCredentialDuplicateStore?: UserCredentialDuplicateStore;
  /** Total pull→resolve→push attempts before giving up (default `MAX_SYNC_ATTEMPTS`). */
  maxAttempts?: number;
  /**
   * Optional progress callback (cold-bootstrap follow-up): called with the
   * cumulative count applied so far THIS run, once per page. A join against a
   * mature center can be thousands of entities across many pages — this is
   * what lets the UI show real, moving progress instead of an indeterminate
   * spinner for however long that takes. Omit for an ordinary sync where no
   * caller renders progress.
   */
  onPage?: (applied: number) => void;
};

export type SyncResult = {
  readonly status: 'synced' | 'retries-exhausted';
  /** Entities applied or auto-merged from the pull. */
  readonly applied: number;
  /** Entities pushed and accepted by the hub. */
  readonly pushed: number;
  readonly conflicts: readonly SyncConflict[];
  /**
   * Subject-code clashes auto-resolved this run (SOU-122) — deterministic, no
   * human needed. Surfaced so a future admin nudge / log can report them.
   */
  readonly subjectCodeCollisions: readonly SubjectCodeCollision[];
  /**
   * Session natural-key clashes auto-resolved this run (SOU-188) — deterministic,
   * no human needed. Surfaced so a future admin nudge / log can report them.
   */
  readonly sessionDedups: readonly SessionDedup[];
  readonly reversalDedups: readonly ReversalDedup[];
  /**
   * Same-username `users` duplicates noticed this run (SOU-258 follow-up) — two
   * laptops created the same account offline. Deterministic (greatest-ULID wins),
   * no human needed; surfaced so the UI can nudge a password reset for the
   * shadowed credential.
   */
  readonly userCredentialDuplicates: readonly UserCredentialDuplicate[];
  readonly cursor: SyncCursor | null;
  /** True when the device clock diverged absurdly from the hub's — flagged, not trusted. */
  readonly deviceClockSkew: boolean;
  readonly resolutionPermission: 'granted' | 'queued';
};

export class SyncEngine {
  private readonly hub: SyncHubPort;
  private readonly local: LocalSyncRepository;
  private readonly clock: Clock;
  private readonly plan: PlanPolicy;
  private readonly deviceId: DeviceId;
  private readonly updatedBy: UserId;
  private readonly centreId: CenterCode;
  private readonly userCanResolve: boolean;
  private readonly maxAttempts: number;
  private readonly onPage: ((applied: number) => void) | undefined;
  private readonly resolver: ChangeResolver;

  constructor(input: SyncEngineInput) {
    this.hub = input.hub;
    this.local = input.local;
    this.clock = input.clock;
    this.plan = input.plan;
    this.deviceId = input.deviceId;
    this.updatedBy = input.updatedBy;
    this.centreId = input.centreId;
    this.userCanResolve = input.userCanResolve;
    this.maxAttempts = input.maxAttempts ?? MAX_SYNC_ATTEMPTS;
    this.onPage = input.onPage;
    this.resolver = new ChangeResolver(
      input.local,
      input.clock,
      input.deviceId,
      input.updatedBy,
      input.centreId,
      input.subjectCollisionStore ?? null,
      input.sessionDedupStore ?? null,
      input.paymentReversalDedupStore ?? null,
      input.userCredentialDuplicateStore ?? null,
    );
  }

  async run(matcher: DuplicateMatcher): Promise<SyncResult> {
    this.plan.require('sync.multi-device');

    const conflicts: SyncConflict[] = [];
    const collisions: SubjectCodeCollision[] = [];
    const dedups: SessionDedup[] = [];
    const reversalDedups: ReversalDedup[] = [];
    const userCredentialDuplicates: UserCredentialDuplicate[] = [];
    // Built once and reused across every page/attempt: `resolveBatch` only
    // pushes onto these arrays, so accumulation across the whole run is exactly
    // what re-passing the same object gives for free.
    const resolveOutput: Parameters<ChangeResolver['resolveBatch']>[2] = {
      conflicts,
      subjectCodeCollisions: collisions,
      sessionDedups: dedups,
      reversalDedups,
      userCredentialDuplicates,
    };
    let applied = 0;
    let pushed = 0;
    let deviceClockSkew = false;

    // The device's own cursor is the source of truth. A fresh install (empty
    // local DB) has no cursor and pulls from 0 — the hub's per-device cursor is
    // the hub's bookkeeping (rejection freshness, feed retention), never a
    // shortcut to skip pulls, or a fresh install could silently miss data.
    let cursor = this.local.getCursor();

    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      // Drain every page the hub offers before moving on to push: a hub may cap
      // one pull well below "everything since cursor" (a cold bootstrap against
      // a mature center can be years of history), so `hasMore` decides whether
      // to keep pulling rather than a single call being assumed complete. The
      // cursor is persisted after each page — not just once at the end — so an
      // interrupted multi-page drain resumes on the next sync instead of
      // re-fetching everything from scratch.
      let batch = await this.pullOnePage(cursor);
      deviceClockSkew = deviceClockSkew || this.isClockSkewed(batch.hubTime);
      applied += this.applyPage(batch, matcher, resolveOutput);
      cursor = batch.cursor;
      this.local.setCursor(cursor);
      this.onPage?.(applied);

      while (batch.hasMore) {
        batch = await this.pullOnePage(cursor);
        deviceClockSkew = deviceClockSkew || this.isClockSkewed(batch.hubTime);
        applied += this.applyPage(batch, matcher, resolveOutput);
        cursor = batch.cursor;
        this.local.setCursor(cursor);
        this.onPage?.(applied);
      }

      const push = await this.pushPending(cursor);
      pushed += push.pushed;
      if (push.status === 'accepted') {
        this.local.setCursor(push.cursor);
        return this.result('synced', applied, pushed, conflicts, collisions, dedups, reversalDedups, userCredentialDuplicates, push.cursor, deviceClockSkew);
      }
      // Rejected-stale: a concurrent sync won the version race for some entity.
      // Cursor is unchanged, so the next pull re-delivers the winning change and
      // this device re-resolves (idempotent via the version skip in the resolver).
      cursor = push.cursor;
    }

    this.local.setCursor(cursor ?? { seq: 0 });
    return this.result('retries-exhausted', applied, pushed, conflicts, collisions, dedups, reversalDedups, userCredentialDuplicates, cursor, deviceClockSkew);
  }

  private result(
    status: SyncResult['status'],
    applied: number,
    pushed: number,
    conflicts: readonly SyncConflict[],
    subjectCodeCollisions: readonly SubjectCodeCollision[],
    sessionDedups: readonly SessionDedup[],
    reversalDedups: readonly ReversalDedup[],
    userCredentialDuplicates: readonly UserCredentialDuplicate[],
    cursor: SyncCursor | null,
    deviceClockSkew: boolean,
  ): SyncResult {
    return {
      status,
      applied,
      pushed,
      conflicts,
      subjectCodeCollisions,
      sessionDedups,
      reversalDedups,
      userCredentialDuplicates,
      cursor,
      deviceClockSkew,
      resolutionPermission: this.userCanResolve ? 'granted' : 'queued',
    };
  }

  private async pushPending(noopCursor: SyncCursor): Promise<
    | { status: 'accepted'; cursor: SyncCursor; pushed: number }
    | { status: 'rejected-stale'; cursor: SyncCursor; pushed: number }
  > {
    const pending = this.local.listPending();
    if (pending.length === 0) {
      // Nothing to write — the pull already advanced the cursor; no hub round-trip.
      return { status: 'accepted', cursor: noopCursor, pushed: 0 };
    }

    const result = await this.hub.pushChanges({
      centreId: this.centreId,
      deviceId: this.deviceId,
      changes: pending,
      schemaVersion: SCHEMA_VERSION,
    });

    if (result.status === 'accepted') {
      for (const change of pending) {
        const key = entityKey(change.entityType, change.entityId);
        const assigned = result.versions[key];
        // An `accepted` push MUST assign a version for every pushed entity; a
        // missing one would leave the write pending and re-pushed every cycle.
        if (assigned === undefined) throw new SyncProtocolError(key);
        this.local.markSynced(change.entityType, change.entityId, assigned);
      }
      return { status: 'accepted', cursor: result.cursor, pushed: pending.length };
    }
    return { status: 'rejected-stale', cursor: result.cursor, pushed: 0 };
  }

  private isClockSkewed(hubTime: Date): boolean {
    const diff = Math.abs(this.clock.now().getTime() - hubTime.getTime());
    return diff > CLOCK_SKEW_THRESHOLD_MS;
  }

  private async pullOnePage(cursor: SyncCursor | null): Promise<ChangeBatch> {
    const batch = await this.hub.pullChanges(this.centreId, cursor, this.deviceId);
    if (batch.schemaVersion > SCHEMA_VERSION) {
      // Too old to write. Pull is additive-safe, but a too-old device cannot
      // round-trip shapes other devices already wrote — stop before it diverges.
      throw new SchemaTooOldError(SCHEMA_VERSION, batch.schemaVersion);
    }
    return batch;
  }

  /**
   * Resolve one page through the batching seam: when the local
   * adapter has a real transaction (`runBatch`), a page of up to thousands of
   * entities commits once instead of once per entity — the difference between a
   * cold bootstrap finishing in seconds and taking the better part of an hour.
   * Falls back to calling the resolver directly when the adapter has no such
   * notion (e.g. an in-memory test double).
   */
  private applyPage(
    batch: ChangeBatch,
    matcher: DuplicateMatcher,
    output: Parameters<ChangeResolver['resolveBatch']>[2],
  ): number {
    const runBatch = this.local.runBatch?.bind(this.local) ?? (<T,>(fn: () => T): T => fn());
    return runBatch(() => this.resolver.resolveBatch(batch.changes, matcher, output));
  }
}
