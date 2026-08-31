import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import {
  DuplicateMatcher,
  PLANS,
  PlanPolicy,
  ResolveConflict,
  SyncEngine,
  type ConflictResolution,
  type CenterCode,
  type CenterHoursOverride,
  type CenterHoursOverrideId,
  type Clock,
  type DeviceId,
  type GroupId,
  type RoomId,
  type Session,
  type SessionId,
  type StudentId,
  type SyncResult,
  type Subject,
  type SubjectId,
  type TimeOfDay,
  type User,
  type UserId,
  type WeekdayIndex,
  type WeeklyRecurringSession,
  type WeeklyRecurringSessionId,
  type WeeklyTimeWindows,
} from '@centresoutien/domain';
import { openDatabase, openDatabaseAt } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { hubDbFileName, SqliteHubStore } from '../../src/data/sqlite/hub/hub-store';
import { HubServer } from '../../src/main/hub-server/hub-server';
import { HttpSyncHubClient } from '../../src/data/sync/http-sync-hub-client';
import { SqliteSubjectRepository } from '../../src/data/sqlite/repositories/subject-repository';
import { SqliteUserRepository } from '../../src/data/sqlite/repositories/user-repository';
import { SqliteSessionRepository } from '../../src/data/sqlite/repositories/session-repository';
import { SqliteWeeklyRecurringSessionRepository } from '../../src/data/sqlite/repositories/weekly-recurring-session-repository';
import { SqliteCenterHoursOverrideRepository } from '../../src/data/sqlite/repositories/center-hours-override-repository';
import { SqliteChangeLogWriter } from '../../src/data/sqlite/change-log/sqlite-change-log-writer';
import { SqliteLocalSyncRepository } from '../../src/data/sqlite/change-log/sqlite-sync-local-repository';
import { SqliteDuplicateMatchSource } from '../../src/data/sqlite/change-log/sqlite-duplicate-match-source';
import { ChangeLogOutbox } from '../../src/data/sqlite/change-log/change-log-outbox';

/**
 * SOU-180 "done when": a real user edit on one device reaches another and shows
 * up in the receiver's REAL entity table (not just the sync shadow). Two devices
 * back a real `SqliteLocalSyncRepository` + `ChangeLogOutbox` and converge
 * through the real `SyncEngine`, real HTTP client, real `HubServer`, and real
 * SQLite canonical store — the same seams SOU-82's two Electron instances use.
 *
 * This exercises BOTH halves the ticket adds: the outbox (a `subjectRepo.save`
 * becomes a pushable pending) and the apply projection (a pulled change lands in
 * the receiver's `subjects` table, queryable through `SqliteSubjectRepository`).
 */
const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const HUB_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/hub/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const TOKEN = 'test-pairing-token';
const AT = new Date('2026-08-01T10:00:00Z');
const DEV_A = 'dev_0000000000000000000000000A' as DeviceId;
const DEV_B = 'dev_0000000000000000000000000B' as DeviceId;
const USER_A = 'usr_0000000000000000000000000A' as UserId;
const USER_B = 'usr_0000000000000000000000000B' as UserId;
const S1 = 'sub_00000000000000000000000001' as SubjectId;

const clock: Clock = { now: () => AT };

const ROOM = 'rom_00000000000000000000000001' as RoomId;
const GROUP = 'grp_00000000000000000000000001' as GroupId;
const WRS = 'wrs_00000000000000000000000001' as WeeklyRecurringSessionId;
const SESSION = 'ses_00000000000000000000000001' as SessionId;
const OVERRIDE = 'cho_00000000000000000000000001' as CenterHoursOverrideId;

const uniformWeek = (windows: { open: TimeOfDay; close: TimeOfDay }[]): WeeklyTimeWindows => ({
  0: windows, 1: windows, 2: windows, 3: windows, 4: windows, 5: windows, 6: windows,
});

function makeOverride(over: Partial<CenterHoursOverride> = {}): CenterHoursOverride {
  return {
    id: OVERRIDE,
    centerCode: CENTER,
    deviceOrigin: DEV_A,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER_A,
    deletedAt: null,
    version: 0,
    dateRange: { start: '2026-02-18', end: '2026-03-19' },
    hoursByWeekday: uniformWeek([
      { open: '09:00' as TimeOfDay, close: '15:00' as TimeOfDay },
      { open: '21:00' as TimeOfDay, close: '23:00' as TimeOfDay },
    ]),
    ...over,
  };
}

function makeSubject(over: Partial<Subject> = {}): Subject {
  return {
    id: S1,
    centerCode: CENTER,
    deviceOrigin: DEV_A,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER_A,
    deletedAt: null,
    version: 0,
    name: { fr: 'Mathématiques', ar: 'الرياضيات' },
    code: null,
    active: true,
    ...over,
  };
}

function makeWrs(over: Partial<WeeklyRecurringSession> = {}): WeeklyRecurringSession {
  return {
    id: WRS,
    centerCode: CENTER,
    deviceOrigin: DEV_A,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER_A,
    deletedAt: null,
    version: 0,
    roomId: ROOM,
    teacherId: null,
    groupId: GROUP,
    dayOfWeek: 1 as WeekdayIndex,
    start: '09:00' as TimeOfDay,
    end: '11:00' as TimeOfDay,
    active: true,
    validFrom: null,
    validTo: null,
    ...over,
  };
}

function makeSession(over: Partial<Session> = {}): Session {
  return {
    id: SESSION,
    centerCode: CENTER,
    deviceOrigin: DEV_A,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER_A,
    deletedAt: null,
    version: 0,
    recurringSessionId: WRS,
    generationBatchId: null,
    roomId: ROOM,
    teacherId: null,
    groupId: GROUP,
    date: '2026-09-05',
    start: '09:00' as TimeOfDay,
    end: '10:30' as TimeOfDay,
    ...over,
  };
}

/** A real device: its own encrypted center DB, subject repo, sync store, outbox, engine. */
class Device {
  readonly dir: string;
  readonly db: DB;
  readonly subjects: SqliteSubjectRepository;
  readonly users: SqliteUserRepository;
  readonly weeklySessions: SqliteWeeklyRecurringSessionRepository;
  readonly sessions: SqliteSessionRepository;
  readonly overrides: SqliteCenterHoursOverrideRepository;
  private readonly local: SqliteLocalSyncRepository;
  private readonly outbox: ChangeLogOutbox;
  private readonly engine: SyncEngine;
  private readonly matcher: DuplicateMatcher;
  private readonly userId: UserId;
  private readonly deviceId: DeviceId;

  constructor(deviceId: DeviceId, userId: UserId, hubPort: number) {
    this.userId = userId;
    this.deviceId = deviceId;
    this.dir = mkdtempSync(join(tmpdir(), `cs-device-${deviceId.slice(-1)}-`));
    this.db = openDatabase({ centreId: 'local', key: KEY, dir: this.dir });
    runMigrations(this.db, REAL_MIGRATIONS);
    const changeLog = new SqliteChangeLogWriter(this.db, clock, deviceId);
    this.subjects = new SqliteSubjectRepository(this.db, changeLog);
    this.users = new SqliteUserRepository(this.db, changeLog);
    this.weeklySessions = new SqliteWeeklyRecurringSessionRepository(this.db, changeLog);
    this.sessions = new SqliteSessionRepository(this.db, changeLog);
    this.overrides = new SqliteCenterHoursOverrideRepository(this.db, changeLog);
    this.local = new SqliteLocalSyncRepository(this.db, clock, deviceId, CENTER);
    this.outbox = new ChangeLogOutbox(this.db, this.local, CENTER, deviceId, userId);
    this.matcher = new DuplicateMatcher(new SqliteDuplicateMatchSource(this.db));
    this.engine = new SyncEngine({
      hub: new HttpSyncHubClient({ baseUrl: `http://127.0.0.1:${hubPort}`, token: TOKEN }),
      local: this.local,
      clock,
      plan: new PlanPolicy(PLANS.premium),
      deviceId,
      updatedBy: userId,
      centreId: CENTER,
      userCanResolve: true,
      sessionDedupStore: this.local,
      userCredentialDuplicateStore: this.local,
    });
  }

  /** The sync path the IPC handler runs: drain local writes, then pull → resolve → push. */
  async sync(): Promise<SyncResult> {
    this.outbox.drain();
    return this.engine.run(this.matcher);
  }

  blockedCount(): number {
    return this.local.listBlocked().length;
  }

  localPendingCount(): number {
    return this.local.listPending().length;
  }

  firstBlockedKind(): string | undefined {
    return this.local.listBlocked()[0]?.kind;
  }

  /** The "conflits en attente" action, wired exactly as the composition root does. */
  resolveSessionConflict(entityId: SessionId, resolution: ConflictResolution): void {
    new ResolveConflict(this.local, clock, new PlanPolicy(PLANS.premium), this.local).execute({
      entityType: 'sessions',
      entityId,
      deviceId: this.deviceId,
      updatedBy: this.userId,
      resolution,
    });
  }

  dispose(): void {
    this.db.close();
    rmSync(this.dir, { recursive: true, force: true });
  }
}

let hubDir: string;
let hubDb: DB;
let store: SqliteHubStore;
let server: HubServer;
let a: Device;
let b: Device;

beforeEach(async () => {
  hubDir = mkdtempSync(join(tmpdir(), 'cs-device-hub-'));
  hubDb = openDatabaseAt(join(hubDir, hubDbFileName('local')), KEY);
  runMigrations(hubDb, HUB_MIGRATIONS);
  store = new SqliteHubStore(hubDb, clock);
  store.registerCenter(CENTER, TOKEN, AT);
  server = new HubServer(store, 0, '127.0.0.1');
  await server.start();
  a = new Device(DEV_A, USER_A, server.port());
  b = new Device(DEV_B, USER_B, server.port());
});

afterEach(async () => {
  a.dispose();
  b.dispose();
  await server.stop();
  store.close();
  rmSync(hubDir, { recursive: true, force: true });
});

describe('device-to-device sync persistence (SOU-180)', () => {
  it('a subject created on A appears in B’s real subjects table after sync', async () => {
    await a.subjects.save(makeSubject());
    await a.sync();

    // Before B syncs it knows nothing about the subject.
    expect(await b.subjects.findById(S1)).toBeNull();

    await b.sync();

    const onB = await b.subjects.findById(S1);
    expect(onB).not.toBeNull();
    expect(onB?.name).toEqual({ fr: 'Mathématiques', ar: 'الرياضيات' });
    expect(onB?.version).toBe(1);
    // Provenance is preserved — the row still originates on A.
    expect(onB?.deviceOrigin).toBe(DEV_A);
  });

  it('an edit on A flows to B’s real row on the next sync', async () => {
    await a.subjects.save(makeSubject());
    await a.sync();
    await b.sync();

    await a.subjects.save(makeSubject({ name: { fr: 'Physique', ar: 'فيزياء' }, version: 1 }));
    await a.sync();
    await b.sync();

    expect((await b.subjects.findById(S1))?.name.fr).toBe('Physique');
  });

  it('non-overlapping field edits auto-merge with no conflict; both real rows converge', async () => {
    await a.subjects.save(makeSubject());
    await a.sync();
    await b.sync();

    // A changes the name, B toggles active — disjoint fields from the same base.
    await a.subjects.save(makeSubject({ name: { fr: 'Physique', ar: 'فيزياء' }, version: 1 }));
    await b.subjects.save(makeSubject({ active: false, version: 1 }));

    await a.sync(); // A pushes the name change (hub v2)
    await b.sync(); // B pulls v2, auto-merges its active toggle, pushes (hub v3)
    await a.sync(); // A pulls the merged result

    const onA = await a.subjects.findById(S1);
    const onB = await b.subjects.findById(S1);
    expect(a.blockedCount()).toBe(0);
    expect(b.blockedCount()).toBe(0);
    expect(onA?.name.fr).toBe('Physique');
    expect(onA?.active).toBe(false);
    expect(onB).toMatchObject({ name: { fr: 'Physique' }, active: false });
  });

  it('same-field edits surface a field-clash; nothing is silently overwritten', async () => {
    await a.subjects.save(makeSubject());
    await a.sync();
    await b.sync();

    // Both edit the SAME field (name) from the same base version.
    await a.subjects.save(makeSubject({ name: { fr: 'AAA', ar: 'أ' }, version: 1 }));
    await b.subjects.save(makeSubject({ name: { fr: 'BBB', ar: 'ب' }, version: 1 }));

    await a.sync(); // A wins the race to the hub (v2)
    await b.sync(); // B pulls v2, its same-field edit clashes → blocked, not applied

    expect(b.blockedCount()).toBe(1);
    expect(b.firstBlockedKind()).toBe('field-clash');
    // B keeps its own edit; A's value never silently clobbered it.
    expect((await b.subjects.findById(S1))?.name.fr).toBe('BBB');
  });

  it('a weekly recurring session’s group_id survives push → pull onto B’s real row', async () => {
    await a.weeklySessions.save(makeWrs());
    await a.sync();

    expect(await b.weeklySessions.findById(WRS)).toBeNull();

    await b.sync();

    const onB = await b.weeklySessions.findById(WRS);
    expect(onB).not.toBeNull();
    // Planner enrichment converges: the group link arrived, not the neutral fallback.
    expect(onB?.groupId).toBe(GROUP);
    expect(onB?.roomId).toBe(ROOM);
    expect(onB?.version).toBe(1);
    expect(onB?.deviceOrigin).toBe(DEV_A);
  });

  it('a concrete session’s group_id survives push → pull onto B’s real row', async () => {
    await a.sessions.save(makeSession());
    await a.sync();

    expect(await b.sessions.findById(SESSION)).toBeNull();

    await b.sync();

    const onB = await b.sessions.findById(SESSION);
    expect(onB).not.toBeNull();
    expect(onB?.groupId).toBe(GROUP);
    expect(onB?.recurringSessionId).toBe(WRS);
    expect(onB?.version).toBe(1);
    expect(onB?.deviceOrigin).toBe(DEV_A);
  });

  it('a weekly recurring session tombstone propagates to B (deleted_at set)', async () => {
    await a.weeklySessions.save(makeWrs());
    await a.sync();
    await b.sync();

    await a.weeklySessions.softDelete(WRS, new Date('2026-08-02T00:00:00Z'), USER_A);
    await a.sync();
    await b.sync();

    const changed = await b.weeklySessions.listChangedSince(AT);
    const tombstone = changed.find((s) => s.id === WRS);
    expect(tombstone).toBeDefined();
    expect(tombstone?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
  });

  it('a concrete session tombstone propagates to B (deleted_at set)', async () => {
    await a.sessions.save(makeSession());
    await a.sync();
    await b.sync();

    await a.sessions.softDelete(SESSION, new Date('2026-08-03T00:00:00Z'), USER_A);
    await a.sync();
    await b.sync();

    const changed = await b.sessions.listChangedSince(AT);
    const tombstone = changed.find((s) => s.id === SESSION);
    expect(tombstone).toBeDefined();
    expect(tombstone?.deletedAt).toEqual(new Date('2026-08-03T00:00:00Z'));
  });
});

describe('session natural-key collision (SOU-188)', () => {
  const SESSION_LO = SESSION; // lower ULID
  const SESSION_HI = 'ses_00000000000000000000000002' as SessionId;
  const STUDENT = 'stu_00000000000000000000000001' as StudentId;
  const ATT = 'att_00000000000000000000000001';

  /** Seed a roll-call record for one session on a device (attendance is local-only today). */
  function insertAttendance(device: Device, sessionId: SessionId): void {
    device.db
      .prepare(
        `INSERT INTO attendance_records
           (id, center_code, device_origin, created_at, updated_at, updated_by,
            deleted_at, version, session_id, student_id, status, note)
         VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, 'present', NULL)`,
      )
      .run(ATT, CENTER, DEV_B, AT.toISOString(), AT.toISOString(), USER_B, sessionId, STUDENT);
  }

  it('two devices materializing the same (WRS, date) offline converge on the lower-ULID row — no wedge', async () => {
    await a.sessions.save(makeSession({ id: SESSION_LO }));
    await b.sessions.save(makeSession({ id: SESSION_HI, deviceOrigin: DEV_B, updatedBy: USER_B }));

    await a.sync(); // A pushes the lower-ULID winner
    await b.sync(); // B pulls it → absorbs its own higher-ULID duplicate

    expect(b.blockedCount()).toBe(0);
    expect(b.localPendingCount()).toBe(0); // the loser's pending push was retracted

    const onB = await b.sessions.listForRange(CENTER, { start: '2026-09-01', end: '2026-09-30' });
    expect(onB).toHaveLength(1);
    expect(onB[0]?.id).toBe(SESSION_LO);
    expect(await b.sessions.findById(SESSION_HI)).toBeNull();
    expect((await a.sessions.findById(SESSION_LO))?.id).toBe(SESSION_LO);
  });

  it('the reverse arrival order converges on the same lower-ULID row', async () => {
    await a.sessions.save(makeSession({ id: SESSION_LO }));
    await b.sessions.save(makeSession({ id: SESSION_HI, deviceOrigin: DEV_B, updatedBy: USER_B }));

    await b.sync(); // B pushes its higher-ULID duplicate first
    await a.sync(); // A pulls it → the inbound is the loser, A keeps its lower-ULID row
    await b.sync(); // B now pulls A's winner and absorbs

    expect(a.blockedCount()).toBe(0);
    expect(b.blockedCount()).toBe(0);
    expect((await a.sessions.findById(SESSION_LO))?.id).toBe(SESSION_LO);
    expect(await a.sessions.findById(SESSION_HI)).toBeNull();
    expect((await b.sessions.findById(SESSION_LO))?.id).toBe(SESSION_LO);
    expect(await b.sessions.findById(SESSION_HI)).toBeNull();
  });

  it('attendance referencing the absorbed session is re-pointed to the winner', async () => {
    await a.sessions.save(makeSession({ id: SESSION_LO }));
    await b.sessions.save(makeSession({ id: SESSION_HI, deviceOrigin: DEV_B, updatedBy: USER_B }));
    // B already took roll-call on its local (soon-to-be-absorbed) session.
    insertAttendance(b, SESSION_HI);

    await a.sync();
    await b.sync(); // absorb rewrites SES_HI → SES_LO and re-points the attendance

    const row = b.db
      .prepare('SELECT session_id FROM attendance_records WHERE id = ?')
      .get(ATT) as { session_id: string };
    expect(row.session_id).toBe(SESSION_LO);
    expect(row.session_id).not.toBe(SESSION_HI);
  });

  it('a cancel on A vs a live occurrence on B is a delete-vs-edit conflict — no wedge, B keeps its row', async () => {
    await a.sessions.save(makeSession({ id: SESSION_LO }));
    await a.sessions.softDelete(SESSION_LO, new Date('2026-08-02T00:00:00Z'), USER_A);
    await a.sync();

    await b.sessions.save(makeSession({ id: SESSION_HI, deviceOrigin: DEV_B, updatedBy: USER_B }));
    await b.sync();

    expect(b.blockedCount()).toBe(1);
    expect(b.firstBlockedKind()).toBe('delete-vs-edit');
    // B's live occurrence survives — the cancel did not silently win.
    expect((await b.sessions.findById(SESSION_HI))?.id).toBe(SESSION_HI);
    const all = await b.sessions.listForRange(CENTER, { start: '2026-09-01', end: '2026-09-30' });
    expect(all).toHaveLength(1);
  });

  it('a cancel on B vs a live occurrence on A is a delete-vs-edit conflict on A', async () => {
    await b.sessions.save(makeSession({ id: SESSION_HI, deviceOrigin: DEV_B, updatedBy: USER_B }));
    await b.sessions.softDelete(SESSION_HI, new Date('2026-08-02T00:00:00Z'), USER_B);
    await b.sync();

    await a.sessions.save(makeSession({ id: SESSION_LO }));
    await a.sync();

    expect(a.blockedCount()).toBe(1);
    expect(a.firstBlockedKind()).toBe('delete-vs-edit');
    expect((await a.sessions.findById(SESSION_LO))?.id).toBe(SESSION_LO);
  });

  it('an unsynced local edit on B survives a winner arriving from A (field-clash, no clobber)', async () => {
    await a.sessions.save(makeSession({ id: SESSION_LO }));
    await a.sync();

    await b.sessions.save(makeSession({ id: SESSION_HI, deviceOrigin: DEV_B, updatedBy: USER_B }));
    await b.sessions.save(
      makeSession({
        id: SESSION_HI,
        deviceOrigin: DEV_B,
        updatedBy: USER_B,
        roomId: 'rom_00000000000000000000000009' as RoomId,
      }),
    );
    await b.sync();

    expect(b.blockedCount()).toBe(1);
    expect(b.firstBlockedKind()).toBe('field-clash');
    // The user's room edit survived; absorb never clobbered it.
    const onB = await b.sessions.findById(SESSION_HI);
    expect(onB?.roomId).toBe('rom_00000000000000000000000009');
  });
});

/**
 * SOU-194 — resolving a session natural-key conflict must be natural-key-aware:
 * the human's choice survives under the lower-ULID WINNER id with the loser
 * retired. Without this, take-theirs re-wedges `ux_sessions_recurrence_date` at
 * the next `markSynced` projection and take-mine leaves the winner silently
 * un-applied (the cursor consumed it) — permanent divergence. Each scenario
 * drives a real conflict on B, resolves it through the real `ResolveConflict`,
 * then syncs both devices to convergence.
 */
describe('session natural-key conflict resolution (SOU-194)', () => {
  const SESSION_LO = SESSION; // lower ULID
  const SESSION_HI = 'ses_00000000000000000000000002' as SessionId;
  const STUDENT = 'stu_00000000000000000000000001' as StudentId;
  const ATT = 'att_00000000000000000000000001';

  function insertAttendance(device: Device, sessionId: SessionId): void {
    device.db
      .prepare(
        `INSERT INTO attendance_records
           (id, center_code, device_origin, created_at, updated_at, updated_by,
            deleted_at, version, session_id, student_id, status, note)
         VALUES (?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, 'present', NULL)`,
      )
      .run(ATT, CENTER, DEV_B, AT.toISOString(), AT.toISOString(), USER_B, sessionId, STUDENT);
  }

  /** A deletes the winner, B holds the loser live → delete-vs-edit blocked on B. */
  async function deleteVsEditOnB(): Promise<void> {
    await a.sessions.save(makeSession({ id: SESSION_LO }));
    await a.sessions.softDelete(SESSION_LO, new Date('2026-08-02T00:00:00Z'), USER_A);
    await a.sync();
    await b.sessions.save(makeSession({ id: SESSION_HI, deviceOrigin: DEV_B, updatedBy: USER_B }));
    await b.sync();
    expect(b.blockedCount()).toBe(1);
    expect(b.firstBlockedKind()).toBe('delete-vs-edit');
  }

  it('take-theirs converges both devices on the winner id — no unique-index wedge', async () => {
    await deleteVsEditOnB();

    b.resolveSessionConflict(SESSION_HI, { choice: 'take-theirs' });
    await b.sync(); // the resolution push is accepted, not stale-rejected
    await a.sync(); // A converges on the winner id

    expect(b.blockedCount()).toBe(0);
    // One row per natural key on B, under the lower-ULID winner — the cancel
    // survived as a tombstone (findById/listForRange exclude it by design).
    const onB = await b.sessions.listChangedSince(AT);
    expect(onB.filter((s) => s.recurringSessionId === WRS)).toHaveLength(1);
    expect(onB.find((s) => s.id === SESSION_LO)?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
    expect(onB.find((s) => s.id === SESSION_HI)).toBeUndefined();
    expect(await b.sessions.findById(SESSION_LO)).toBeNull();
    // The cancel (their version) is the survivor on A too — no divergence.
    expect(await a.sessions.findById(SESSION_LO)).toBeNull();
    expect(await a.sessions.findById(SESSION_HI)).toBeNull();
  });

  it('take-mine keeps the local live occurrence, surviving under the winner id', async () => {
    await deleteVsEditOnB();

    b.resolveSessionConflict(SESSION_HI, { choice: 'take-mine' });
    await b.sync();
    await a.sync();

    expect(b.blockedCount()).toBe(0);
    const onB = await b.sessions.listForRange(CENTER, { start: '2026-09-01', end: '2026-09-30' });
    expect(onB).toHaveLength(1);
    expect(onB[0]?.id).toBe(SESSION_LO);
    expect(onB[0]?.deletedAt).toBeNull(); // B's "keep the occurrence" won, under the winner id
    // A resurrects the occurrence it had cancelled — the human's choice propagates.
    expect((await a.sessions.findById(SESSION_LO))?.deletedAt).toBeNull();
    expect(await a.sessions.findById(SESSION_HI)).toBeNull();
  });

  it('attendance on the absorbed session is re-pointed to the winner after resolution', async () => {
    await deleteVsEditOnB();
    insertAttendance(b, SESSION_HI); // B already took roll-call on its losing occurrence

    b.resolveSessionConflict(SESSION_HI, { choice: 'take-mine' });
    await b.sync(); // the resolution rewrote the loser row to the winner id

    const row = b.db
      .prepare('SELECT session_id FROM attendance_records WHERE id = ?')
      .get(ATT) as { session_id: string };
    expect(row.session_id).toBe(SESSION_LO);
  });
});

/*
 * SOU-199 — a `center_hours_overrides` write now logs to `change_log`, so a
 * Ramadan-style override created on one device propagates to another through the
 * ordinary pull → resolve → push cycle and lands in the receiver's REAL
 * `center_hours_overrides` table (visible to the generator + conflict check),
 * not just the sync shadow. `version` counters + the retry loop decide ordering;
 * no wall-clock last-writer-wins.
 */
describe('center-hours-override sync (SOU-199)', () => {
  it('an override created on A appears in B’s real center_hours_overrides table after sync', async () => {
    await a.overrides.save(makeOverride());
    await a.sync();

    expect(await b.overrides.findById(OVERRIDE)).toBeNull();

    await b.sync();

    const onB = await b.overrides.findById(OVERRIDE);
    expect(onB).not.toBeNull();
    expect(onB?.dateRange).toEqual({ start: '2026-02-18', end: '2026-03-19' });
    expect(onB?.hoursByWeekday[0]).toEqual([
      { open: '09:00', close: '15:00' },
      { open: '21:00', close: '23:00' },
    ]);
    expect(onB?.version).toBe(1);
    expect(onB?.deviceOrigin).toBe(DEV_A);
  });

  it('non-overlapping field edits (range vs hours) auto-merge; both real rows converge', async () => {
    await a.overrides.save(makeOverride());
    await a.sync();
    await b.sync();

    // A extends the date range; B rewrites the weekly hours — disjoint fields.
    await a.overrides.save(makeOverride({ dateRange: { start: '2026-02-18', end: '2026-03-25' }, version: 1 }));
    await b.overrides.save(
      makeOverride({
        hoursByWeekday: uniformWeek([{ open: '10:00' as TimeOfDay, close: '16:00' as TimeOfDay }]),
        version: 1,
      }),
    );

    await a.sync(); // A pushes the range change (hub v2)
    await b.sync(); // B pulls v2, auto-merges its hours change, pushes (hub v3)
    await a.sync(); // A pulls the merged result

    expect(a.blockedCount()).toBe(0);
    expect(b.blockedCount()).toBe(0);
    const onA = await a.overrides.findById(OVERRIDE);
    const onB = await b.overrides.findById(OVERRIDE);
    expect(onA?.dateRange.end).toBe('2026-03-25');
    expect(onA?.hoursByWeekday[1]).toEqual([{ open: '10:00', close: '16:00' }]);
    expect(onB?.dateRange.end).toBe('2026-03-25');
    expect(onB?.hoursByWeekday[1]).toEqual([{ open: '10:00', close: '16:00' }]);
  });

  it('same-field edits surface a field-clash; nothing is silently wall-clock overwritten', async () => {
    await a.overrides.save(makeOverride());
    await a.sync();
    await b.sync();

    // Both edit the SAME field (hoursByWeekday) from the same base version.
    await a.overrides.save(
      makeOverride({
        hoursByWeekday: uniformWeek([{ open: '08:00' as TimeOfDay, close: '12:00' as TimeOfDay }]),
        version: 1,
      }),
    );
    await b.overrides.save(
      makeOverride({
        hoursByWeekday: uniformWeek([{ open: '14:00' as TimeOfDay, close: '18:00' as TimeOfDay }]),
        version: 1,
      }),
    );

    await a.sync(); // A wins the race to the hub (v2)
    await b.sync(); // B pulls v2, its same-field edit clashes → blocked, not applied

    expect(b.blockedCount()).toBe(1);
    expect(b.firstBlockedKind()).toBe('field-clash');
    // B keeps its own edit; A's value never silently clobbered it.
    expect((await b.overrides.findById(OVERRIDE))?.hoursByWeekday[0]).toEqual([
      { open: '14:00', close: '18:00' },
    ]);
  });

  it('a soft-delete tombstone propagates to B and hides the override', async () => {
    await a.overrides.save(makeOverride());
    await a.sync();
    await b.sync();
    expect(await b.overrides.findById(OVERRIDE)).not.toBeNull();

    await a.overrides.softDelete(OVERRIDE, new Date('2026-08-02T00:00:00Z'), USER_A);
    await a.sync();
    await b.sync();

    // Live read hides it on B; the tombstone is present in the sync feed.
    expect(await b.overrides.findById(OVERRIDE)).toBeNull();
    const changed = await b.overrides.listChangedSince(AT);
    const tombstone = changed.find((o) => o.id === OVERRIDE);
    expect(tombstone).toBeDefined();
    expect(tombstone?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
  });
});

/*
 * The multi-laptop-sync nightly failure: `users` is a synced entity (0044) and,
 * since SOU-258, the owner credential replicates. Two laptops that each run
 * first-run mint DISTINCT ULIDs for the SAME owner username. Pre-0053 the second
 * device's apply projected the peer's row with `ON CONFLICT(id)` — a fresh id, so
 * a plain INSERT — which the hard `ux_users_username_live` index rejected with
 * `UNIQUE constraint failed`, aborting the ENTIRE sync-apply batch. 0053 relaxed
 * that index to non-unique; the duplicate now converges at read (greatest-id
 * winner), the same shape sessions/subjects use for their collisions.
 */
describe('owner username collision on users (SOU-258 follow-up) — no wedge', () => {
  function makeOwner(id: UserId, deviceOrigin: DeviceId, updatedBy: UserId): User {
    return {
      id,
      centerCode: CENTER,
      deviceOrigin,
      createdAt: AT,
      updatedAt: AT,
      updatedBy,
      deletedAt: null,
      version: 0,
      role: 'owner',
      username: 'directrice',
      fullName: null,
      passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$abc$def',
      setupCodeHash: null,
      setupCodeExpiresAt: null,
      setupCodeRedeemedAt: null,
      email: null,
      permissions: new Set(),
    };
  }

  it('two laptops that each created the owner offline converge without aborting the batch', async () => {
    // USER_A (…0A) < USER_B (…0B), so the deterministic winner is USER_B.
    await a.users.save(makeOwner(USER_A, DEV_A, USER_A));
    await b.users.save(makeOwner(USER_B, DEV_B, USER_B));

    await a.sync(); // A pushes its owner row
    const bResult = await b.sync(); // B pulls it → no UNIQUE-index wedge
    const aResult = await a.sync(); // A pulls B's owner row

    expect(a.blockedCount()).toBe(0);
    expect(b.blockedCount()).toBe(0);

    // The divergence is surfaced (not silent): each device, on the sync that first
    // pulls the peer's owner, reports one duplicate resolved to the greatest-ULID
    // winner (USER_B) — the renderer nudges a password reset for the shadowed one.
    const expectedDuplicate = {
      entityType: 'users' as const,
      username: 'directrice',
      winnerId: USER_B,
      loserId: USER_A,
    };
    expect(bResult.userCredentialDuplicates).toEqual([expectedDuplicate]);
    expect(aResult.userCredentialDuplicates).toEqual([expectedDuplicate]);

    // Both owner rows physically coexist on each device (the peer's row applied),
    // and every device resolves the SAME winner (greatest ULID) at read, so login,
    // the owner-credential write, and the roster never see a duplicate.
    for (const dev of [a, b]) {
      const live = dev.db
        .prepare("SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NULL")
        .get() as { n: number };
      expect(live.n).toBe(2);
      expect((await dev.users.findByUsername('directrice'))?.id).toBe(USER_B);
      expect((await dev.users.findOwner())?.id).toBe(USER_B);
      expect((await dev.users.listActive(CENTER)).map((u) => u.id)).toEqual([USER_B]);
    }
  });
});
