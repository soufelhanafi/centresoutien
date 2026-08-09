import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import {
  DuplicateMatcher,
  PLANS,
  PlanPolicy,
  SyncEngine,
  type CenterCode,
  type Clock,
  type DeviceId,
  type GroupId,
  type RoomId,
  type Session,
  type SessionId,
  type StudentId,
  type Subject,
  type SubjectId,
  type TimeOfDay,
  type UserId,
  type WeekdayIndex,
  type WeeklyRecurringSession,
  type WeeklyRecurringSessionId,
} from '@centresoutien/domain';
import { openDatabase, openDatabaseAt } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { hubDbFileName, SqliteHubStore } from '../../src/data/sqlite/hub/hub-store';
import { HubServer } from '../../src/main/hub-server/hub-server';
import { HttpSyncHubClient } from '../../src/data/sync/http-sync-hub-client';
import { SqliteSubjectRepository } from '../../src/data/sqlite/repositories/subject-repository';
import { SqliteSessionRepository } from '../../src/data/sqlite/repositories/session-repository';
import { SqliteWeeklyRecurringSessionRepository } from '../../src/data/sqlite/repositories/weekly-recurring-session-repository';
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
  readonly weeklySessions: SqliteWeeklyRecurringSessionRepository;
  readonly sessions: SqliteSessionRepository;
  private readonly local: SqliteLocalSyncRepository;
  private readonly outbox: ChangeLogOutbox;
  private readonly engine: SyncEngine;
  private readonly matcher: DuplicateMatcher;

  constructor(deviceId: DeviceId, userId: UserId, hubPort: number) {
    this.dir = mkdtempSync(join(tmpdir(), `cs-device-${deviceId.slice(-1)}-`));
    this.db = openDatabase({ centreId: 'local', key: KEY, dir: this.dir });
    runMigrations(this.db, REAL_MIGRATIONS);
    const changeLog = new SqliteChangeLogWriter(this.db, clock, deviceId);
    this.subjects = new SqliteSubjectRepository(this.db, changeLog);
    this.weeklySessions = new SqliteWeeklyRecurringSessionRepository(this.db, changeLog);
    this.sessions = new SqliteSessionRepository(this.db, changeLog);
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
    });
  }

  /** The sync path the IPC handler runs: drain local writes, then pull → resolve → push. */
  async sync(): Promise<void> {
    this.outbox.drain();
    await this.engine.run(this.matcher);
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
});
