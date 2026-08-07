import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Database as DB } from 'better-sqlite3';
import type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
  CenterCode,
  DeviceId,
  UserId,
  EntityId,
  RoomId,
  GroupId,
  TimeOfDay,
  WeekdayIndex,
} from '@centresoutien/domain';
import { openDatabase } from '../../src/data/sqlite/db';
import { runMigrations } from '../../src/data/sqlite/migration-runner';
import { SqliteWeeklyRecurringSessionRepository } from '../../src/data/sqlite/repositories/weekly-recurring-session-repository';

const KEY = 'passphrase-under-test';
const REAL_MIGRATIONS = join(import.meta.dirname, '../../src/data/sqlite/migrations');
const CENTER = 'CS-CASA-001' as CenterCode;
const OTHER_CENTER = 'CS-RABAT-001' as CenterCode;
const USER = 'usr_00000000000000000000000001' as UserId;
const ROOM_A = 'rom_00000000000000000000000001' as RoomId;
const ROOM_B = 'rom_00000000000000000000000002' as RoomId;
const TEACHER_A = 'tch_00000000000000000000000001' as EntityId;

let dir: string;
let db: DB;
let repo: SqliteWeeklyRecurringSessionRepository;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-wrs-'));
  db = openDatabase({ centreId: 'C1', key: KEY, dir });
  runMigrations(db, REAL_MIGRATIONS);
  repo = new SqliteWeeklyRecurringSessionRepository(db);
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AT = new Date('2026-07-29T10:00:00Z');

let seq = 0;
function makeSession(over: Partial<WeeklyRecurringSession> = {}): WeeklyRecurringSession {
  seq += 1;
  return {
    id: `wrs_${String(seq).padStart(26, '0')}` as WeeklyRecurringSessionId,
    centerCode: CENTER,
    deviceOrigin: 'dev_00000000000000000000000001' as DeviceId,
    createdAt: AT,
    updatedAt: AT,
    updatedBy: USER,
    deletedAt: null,
    version: 0,
    roomId: ROOM_A,
    teacherId: TEACHER_A,
    groupId: null,
    dayOfWeek: 1 as WeekdayIndex,
    start: '09:00' as TimeOfDay,
    end: '10:00' as TimeOfDay,
    active: true,
    validFrom: null,
    validTo: null,
    ...over,
  };
}

// Raw seed helpers for the listWeekView join — the read model reaches across rooms,
// teachers, groups, and subjects, so the integration test inserts those directly
// (full control over envelope + soft-delete, no coupling to their repos). `del`
// sets deleted_at to mark a row archived.
const ISO = AT.toISOString();
const env = (del: string | null = null) =>
  [CENTER, 'dev_00000000000000000000000001', ISO, ISO, USER, del, 0] as const;

function seedRoom(id: string, name: string, del: string | null = null): void {
  db.prepare(
    `INSERT INTO rooms (id, center_code, device_origin, created_at, updated_at, updated_by,
       deleted_at, version, name, capacity, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 30, 1)`,
  ).run(id, ...env(del), name);
}

function seedSubject(id: string, fr: string, ar: string, del: string | null = null): void {
  db.prepare(
    `INSERT INTO subjects (id, center_code, device_origin, created_at, updated_at, updated_by,
       deleted_at, version, name_fr, name_ar, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  ).run(id, ...env(del), fr, ar);
}

function seedTeacher(id: string, fr: string, ar: string, del: string | null = null): void {
  db.prepare(
    `INSERT INTO teachers (id, center_code, device_origin, created_at, updated_at, updated_by,
       deleted_at, version, natural_key, name_fr, name_ar, cin, phone, email, subject_ids, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '+212600000000', NULL, '[]', 1)`,
  ).run(id, ...env(del), `${CENTER}::${id}`, fr, ar);
}

function seedGroup(
  id: string,
  over: { subjectId: string; teacherId?: string | null; kind?: string; level?: string; del?: string | null },
): void {
  db.prepare(
    `INSERT INTO groups (id, center_code, device_origin, created_at, updated_at, updated_by,
       deleted_at, version, subject_id, teacher_id, level, capacity, kind, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 20, ?, 1)`,
  ).run(
    id,
    ...env(over.del ?? null),
    over.subjectId,
    over.teacherId ?? null,
    over.level ?? '2 Bac SM',
    over.kind ?? 'regular',
  );
}

const SUB_MATH = 'sub_00000000000000000000000001';
const GROUP_MATH = 'grp_00000000000000000000000001' as GroupId;

describe('SqliteWeeklyRecurringSessionRepository', () => {
  it('round-trips a session through save + findById with all fields intact', async () => {
    const session = makeSession({ dayOfWeek: 3 as WeekdayIndex, start: '14:30' as TimeOfDay, end: '16:00' as TimeOfDay });
    await repo.save(session);
    expect(await repo.findById(session.id)).toEqual(session);
  });

  it('round-trips a session with no teacher (null preserved)', async () => {
    const session = makeSession({ teacherId: null });
    await repo.save(session);
    expect((await repo.findById(session.id))?.teacherId).toBeNull();
  });

  it('round-trips active + a bounded validity window (SOU-52 columns)', async () => {
    const session = makeSession({
      active: false,
      validFrom: '2026-09-01',
      validTo: '2027-06-30',
    });
    await repo.save(session);
    const found = await repo.findById(session.id);
    expect(found?.active).toBe(false);
    expect(found?.validFrom).toBe('2026-09-01');
    expect(found?.validTo).toBe('2027-06-30');
  });

  it('findById returns null for an unknown id', async () => {
    expect(await repo.findById('wrs_00000000000000000000000099' as WeeklyRecurringSessionId)).toBeNull();
  });

  it('upsert updates mutable fields + version but not identity on a second save', async () => {
    const session = makeSession();
    await repo.save(session);
    await repo.save(
      makeSession({
        id: session.id,
        roomId: ROOM_B,
        teacherId: null,
        dayOfWeek: 5 as WeekdayIndex,
        start: '11:00' as TimeOfDay,
        end: '12:30' as TimeOfDay,
        version: 3,
        updatedAt: new Date('2026-08-01T09:00:00Z'),
      }),
    );
    const found = await repo.findById(session.id);
    expect(found?.roomId).toBe(ROOM_B);
    expect(found?.teacherId).toBeNull();
    expect(found?.version).toBe(3);
    // Identity preserved.
    expect(found?.createdAt).toEqual(AT);
    expect(found?.deviceOrigin).toBe('dev_00000000000000000000000001');
  });

  it('softDelete hides the row from findById but keeps it as a tombstone', async () => {
    const session = makeSession();
    await repo.save(session);
    await repo.softDelete(session.id, new Date('2026-08-02T00:00:00Z'), USER);

    expect(await repo.findById(session.id)).toBeNull();
    const changed = await repo.listChangedSince(AT);
    expect(changed).toHaveLength(1);
    expect(changed[0]?.deletedAt).toEqual(new Date('2026-08-02T00:00:00Z'));
    expect(changed[0]?.updatedBy).toBe(USER);
  });

  describe('listChangedSince', () => {
    it('returns rows updated strictly after the cursor, tombstones included', async () => {
      await repo.save(makeSession({ updatedAt: new Date('2026-07-01T00:00:00Z') }));
      const later = makeSession({ updatedAt: new Date('2026-07-20T00:00:00Z') });
      await repo.save(later);

      const changed = await repo.listChangedSince(new Date('2026-07-10T00:00:00Z'));
      expect(changed.map((s) => s.id)).toEqual([later.id]);
    });
  });

  describe('listWeekView', () => {
    it('orders by weekday then start, excluding tombstones + other centers', async () => {
      await repo.save(makeSession({ dayOfWeek: 3 as WeekdayIndex, start: '09:00' as TimeOfDay, end: '10:00' as TimeOfDay }));
      await repo.save(makeSession({ dayOfWeek: 1 as WeekdayIndex, start: '11:00' as TimeOfDay, end: '12:00' as TimeOfDay }));
      await repo.save(makeSession({ dayOfWeek: 1 as WeekdayIndex, start: '08:00' as TimeOfDay, end: '09:00' as TimeOfDay }));
      const gone = makeSession({ dayOfWeek: 2 as WeekdayIndex });
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, USER);
      await repo.save(makeSession({ centerCode: OTHER_CENTER, dayOfWeek: 1 as WeekdayIndex }));

      const week = await repo.listWeekView(CENTER);
      expect(week.map((s) => [s.dayOfWeek, s.start])).toEqual([
        [1, '08:00'],
        [1, '11:00'],
        [3, '09:00'],
      ]);
    });

    it('enriches a linked session with room + teacher names, subject, level, and kind', async () => {
      seedRoom(ROOM_A, 'Salle A');
      seedTeacher(TEACHER_A, 'M. Alaoui', 'السيد العلوي');
      seedSubject(SUB_MATH, 'Mathématiques', 'الرياضيات');
      seedGroup(GROUP_MATH, { subjectId: SUB_MATH, teacherId: TEACHER_A, kind: 'exam-prep', level: '2 Bac SM' });
      await repo.save(makeSession({ groupId: GROUP_MATH, teacherId: TEACHER_A }));

      const [only] = await repo.listWeekView(CENTER);
      expect(only).toMatchObject({
        roomId: ROOM_A,
        roomName: 'Salle A',
        teacherId: TEACHER_A,
        teacherName: { fr: 'M. Alaoui', ar: 'السيد العلوي' },
        groupId: GROUP_MATH,
        subjectId: SUB_MATH,
        subjectName: { fr: 'Mathématiques', ar: 'الرياضيات' },
        level: '2 Bac SM',
        kind: 'exam-prep',
      });
    });

    it('degrades to the neutral fallback when the session has no group', async () => {
      seedRoom(ROOM_A, 'Salle A');
      seedTeacher(TEACHER_A, 'M. Alaoui', 'السيد العلوي');
      await repo.save(makeSession({ groupId: null, teacherId: TEACHER_A }));

      const [only] = await repo.listWeekView(CENTER);
      expect(only).toMatchObject({
        roomName: 'Salle A',
        teacherName: { fr: 'M. Alaoui', ar: 'السيد العلوي' },
        groupId: null,
        subjectId: null,
        subjectName: null,
        level: null,
        kind: 'regular',
      });
    });

    it('treats an archived group as absent (neutral fallback)', async () => {
      seedSubject(SUB_MATH, 'Mathématiques', 'الرياضيات');
      seedGroup(GROUP_MATH, { subjectId: SUB_MATH, kind: 'exam-prep', del: ISO });
      await repo.save(makeSession({ groupId: GROUP_MATH, teacherId: null }));

      const [only] = await repo.listWeekView(CENTER);
      expect(only).toMatchObject({ subjectId: null, subjectName: null, level: null, kind: 'regular' });
    });

    it('keeps subjectId but nulls subjectName when the subject is archived', async () => {
      seedSubject(SUB_MATH, 'Mathématiques', 'الرياضيات', ISO); // archived subject
      seedGroup(GROUP_MATH, { subjectId: SUB_MATH });
      await repo.save(makeSession({ groupId: GROUP_MATH, teacherId: null }));

      const [only] = await repo.listWeekView(CENTER);
      expect(only.subjectId).toBe(SUB_MATH);
      expect(only.subjectName).toBeNull();
    });

    it('nulls teacherName for an unassigned or archived teacher, and roomName for an archived room', async () => {
      seedRoom(ROOM_A, 'Salle A', ISO); // archived room
      seedTeacher(TEACHER_A, 'M. Alaoui', 'السيد العلوي', ISO); // archived teacher
      await repo.save(makeSession({ groupId: null, teacherId: TEACHER_A })); // assigned but archived
      await repo.save(
        makeSession({ groupId: null, teacherId: null, dayOfWeek: 4 as WeekdayIndex }), // unassigned
      );

      const week = await repo.listWeekView(CENTER);
      expect(week).toHaveLength(2);
      for (const v of week) {
        expect(v.roomName).toBeNull();
        expect(v.teacherName).toBeNull();
      }
    });
  });

  describe('listRefsForDay', () => {
    it('returns pre-scoped conflict refs for the weekday: same center, alive, that day', async () => {
      const onDay = makeSession({ dayOfWeek: 2 as WeekdayIndex });
      await repo.save(onDay);
      await repo.save(makeSession({ dayOfWeek: 4 as WeekdayIndex })); // other day
      const gone = makeSession({ dayOfWeek: 2 as WeekdayIndex });
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, USER); // tombstone
      await repo.save(makeSession({ dayOfWeek: 2 as WeekdayIndex, centerCode: OTHER_CENTER })); // other center

      const refs = await repo.listRefsForDay(CENTER, 2 as WeekdayIndex);
      expect(refs).toHaveLength(1);
      expect(refs[0]).toEqual({
        id: onDay.id,
        roomId: ROOM_A,
        teacherId: TEACHER_A,
        dayOfWeek: 2,
        start: '09:00',
        end: '10:00',
      });
    });

    it('omits teacherId entirely on a teacher-less session', async () => {
      await repo.save(makeSession({ dayOfWeek: 2 as WeekdayIndex, teacherId: null }));
      const refs = await repo.listRefsForDay(CENTER, 2 as WeekdayIndex);
      expect(refs[0]).not.toHaveProperty('teacherId');
    });
  });

  describe('listActiveByGroupId / listActiveByRoomId (SOU-176 seat-fit guard)', () => {
    const GROUP_A = 'grp_00000000000000000000000002' as GroupId;

    it('lists live sessions of one group, same center, tombstones excluded', async () => {
      await repo.save(makeSession({ groupId: GROUP_A, dayOfWeek: 2 as WeekdayIndex }));
      await repo.save(makeSession({ groupId: GROUP_A, dayOfWeek: 4 as WeekdayIndex }));
      const gone = makeSession({ groupId: GROUP_A, dayOfWeek: 5 as WeekdayIndex });
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, USER);
      await repo.save(makeSession({ groupId: null, dayOfWeek: 3 as WeekdayIndex })); // unbound
      await repo.save(makeSession({ groupId: GROUP_A, dayOfWeek: 1 as WeekdayIndex, centerCode: OTHER_CENTER }));

      const bound = await repo.listActiveByGroupId(CENTER, GROUP_A);
      expect(bound.map((s) => s.dayOfWeek)).toEqual([2, 4]);
    });

    it('lists live sessions of one room, same center, tombstones excluded', async () => {
      await repo.save(makeSession({ roomId: ROOM_A, dayOfWeek: 2 as WeekdayIndex }));
      await repo.save(makeSession({ roomId: ROOM_A, dayOfWeek: 4 as WeekdayIndex }));
      const gone = makeSession({ roomId: ROOM_A, dayOfWeek: 5 as WeekdayIndex });
      await repo.save(gone);
      await repo.softDelete(gone.id, AT, USER);
      await repo.save(makeSession({ roomId: ROOM_B, dayOfWeek: 3 as WeekdayIndex })); // other room
      await repo.save(makeSession({ roomId: ROOM_A, dayOfWeek: 1 as WeekdayIndex, centerCode: OTHER_CENTER }));

      const booked = await repo.listActiveByRoomId(CENTER, ROOM_A);
      expect(booked.map((s) => s.dayOfWeek)).toEqual([2, 4]);
    });
  });

  describe('hasActiveSessionForRoom (RoomReferencePort)', () => {
    it('is true while a live session books the room and false once it is tombstoned', async () => {
      const session = makeSession({ roomId: ROOM_A });
      await repo.save(session);
      expect(await repo.hasActiveSessionForRoom(ROOM_A)).toBe(true);
      expect(await repo.hasActiveSessionForRoom(ROOM_B)).toBe(false);

      await repo.softDelete(session.id, AT, USER);
      expect(await repo.hasActiveSessionForRoom(ROOM_A)).toBe(false);
    });
  });

  describe('DB constraints', () => {
    it('rejects an id without the wrs_ prefix (CHECK)', async () => {
      await expect(
        repo.save(makeSession({ id: 'bad_00000000000000000000000001' as WeeklyRecurringSessionId })),
      ).rejects.toThrow();
    });

    it('rejects a day_of_week outside 0..6 (CHECK)', async () => {
      await expect(repo.save(makeSession({ dayOfWeek: 7 as WeekdayIndex }))).rejects.toThrow();
    });

    it('rejects an end_time not strictly after start_time (CHECK)', async () => {
      await expect(
        repo.save(makeSession({ start: '10:00' as TimeOfDay, end: '10:00' as TimeOfDay })),
      ).rejects.toThrow();
    });
  });

  describe('conflict-query performance', () => {
    it('listRefsForDay returns in <10ms on a 500-row dataset', async () => {
      const insertMany = db.transaction((sessions: readonly WeeklyRecurringSession[]) => {
        for (const s of sessions) void repo.save(s);
      });
      // 500 rows spread across all 7 weekdays and both rooms.
      const dataset = Array.from({ length: 500 }, (_, i) =>
        makeSession({
          dayOfWeek: (i % 7) as WeekdayIndex,
          roomId: i % 2 === 0 ? ROOM_A : ROOM_B,
        }),
      );
      insertMany(dataset);

      const started = performance.now();
      const refs = await repo.listRefsForDay(CENTER, 3 as WeekdayIndex);
      const elapsed = performance.now() - started;

      expect(refs.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(10);
    });
  });
});
