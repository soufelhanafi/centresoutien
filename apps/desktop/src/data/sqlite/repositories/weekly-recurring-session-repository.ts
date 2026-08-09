import type { Database as DB } from 'better-sqlite3';
import type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
  WeeklyRecurringSessionRepository,
  WeeklySessionViewReadPort,
  WeeklySessionView,
  RoomReferencePort,
  RoomId,
  GroupId,
  SubjectId,
  GroupKind,
  ScheduledSessionRef,
  CenterCode,
  DeviceId,
  UserId,
  EntityId,
  WeekdayIndex,
  TimeOfDay,
  ChangeLogWriter,
} from '@centresoutien/domain';
import { toEntityId } from '@centresoutien/domain';

/** The `weekly_recurring_sessions` row shape as SQLite returns it. */
type SessionRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  room_id: string;
  teacher_id: string | null;
  group_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: number;
  valid_from: string | null;
  valid_to: string | null;
};

/**
 * One enriched-week row: a session left-joined onto its room, teacher, group, and
 * the group's subject. Join columns are NULL when the related row is missing or
 * archived (`deleted_at IS NULL` is part of each join), so the mapper degrades them
 * to the {@link WeeklySessionView} neutral fallback.
 */
type SessionViewRow = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room_id: string;
  room_name: string | null;
  teacher_id: string | null;
  teacher_name_fr: string | null;
  teacher_name_ar: string | null;
  group_id: string | null;
  subject_id: string | null;
  subject_name_fr: string | null;
  subject_name_ar: string | null;
  level: string | null;
  kind: string | null;
};

function fromRow(row: SessionRow): WeeklyRecurringSession {
  return {
    id: row.id as WeeklyRecurringSessionId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    roomId: row.room_id as RoomId,
    teacherId: row.teacher_id === null ? null : (row.teacher_id as EntityId),
    groupId: row.group_id === null ? null : (row.group_id as GroupId),
    dayOfWeek: row.day_of_week as WeekdayIndex,
    start: row.start_time as TimeOfDay,
    end: row.end_time as TimeOfDay,
    active: row.active !== 0,
    validFrom: row.valid_from,
    validTo: row.valid_to,
  };
}

/** Enriched-week row → planner read model. Degrades missing/archived relations to
 *  the neutral fallback: NULL names/subject/level pass through as `null`, and an
 *  absent group `kind` falls back to `'regular'`. */
function fromViewRow(row: SessionViewRow): WeeklySessionView {
  return {
    id: row.id as WeeklyRecurringSessionId,
    dayOfWeek: row.day_of_week as WeekdayIndex,
    start: row.start_time as TimeOfDay,
    end: row.end_time as TimeOfDay,
    roomId: row.room_id as RoomId,
    roomName: row.room_name,
    teacherId: row.teacher_id === null ? null : (row.teacher_id as EntityId),
    teacherName:
      row.teacher_name_fr === null || row.teacher_name_ar === null
        ? null
        : { fr: row.teacher_name_fr, ar: row.teacher_name_ar },
    groupId: row.group_id === null ? null : (row.group_id as GroupId),
    subjectId: row.subject_id === null ? null : (row.subject_id as SubjectId),
    subjectName:
      row.subject_name_fr === null || row.subject_name_ar === null
        ? null
        : { fr: row.subject_name_fr, ar: row.subject_name_ar },
    level: row.level,
    kind: (row.kind ?? 'regular') as GroupKind,
  };
}

/** Row → conflict ref: widen the id, omit teacherId when NULL (ref makes it optional). */
function toRef(row: SessionRow): ScheduledSessionRef {
  const base = {
    id: row.id as EntityId,
    roomId: row.room_id as RoomId,
    dayOfWeek: row.day_of_week as WeekdayIndex,
    start: row.start_time as TimeOfDay,
    end: row.end_time as TimeOfDay,
  };
  return row.teacher_id === null ? base : { ...base, teacherId: row.teacher_id as EntityId };
}

const SAVE_SQL = `
  INSERT INTO weekly_recurring_sessions
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, room_id, teacher_id, group_id, day_of_week, start_time, end_time,
     active, valid_from, valid_to)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @room_id, @teacher_id, @group_id, @day_of_week, @start_time, @end_time,
     @active, @valid_from, @valid_to)
  ON CONFLICT(id) DO UPDATE SET
    updated_at  = excluded.updated_at,
    updated_by  = excluded.updated_by,
    deleted_at  = excluded.deleted_at,
    version     = excluded.version,
    room_id     = excluded.room_id,
    teacher_id  = excluded.teacher_id,
    group_id    = excluded.group_id,
    day_of_week = excluded.day_of_week,
    start_time  = excluded.start_time,
    end_time    = excluded.end_time,
    active      = excluded.active,
    valid_from  = excluded.valid_from,
    valid_to    = excluded.valid_to
`;

/**
 * Enriched-week read (SOU-118): every live session of the center joined onto its
 * room, teacher, group, and the group's subject. LEFT JOINs so a session with no
 * live group/room/teacher is kept (degraded), never dropped; each join filters
 * `deleted_at IS NULL` so an archived relation reads as absent. Ordered by weekday
 * then start time — the port's contract, served here without a re-sort.
 */
const LIST_WEEK_VIEW_SQL = `
  SELECT
    wrs.id            AS id,
    wrs.day_of_week   AS day_of_week,
    wrs.start_time    AS start_time,
    wrs.end_time      AS end_time,
    wrs.room_id       AS room_id,
    r.name            AS room_name,
    wrs.teacher_id    AS teacher_id,
    t.name_fr         AS teacher_name_fr,
    t.name_ar         AS teacher_name_ar,
    wrs.group_id      AS group_id,
    g.subject_id      AS subject_id,
    s.name_fr         AS subject_name_fr,
    s.name_ar         AS subject_name_ar,
    g.level           AS level,
    g.kind            AS kind
  FROM weekly_recurring_sessions wrs
  LEFT JOIN rooms    r ON r.id = wrs.room_id    AND r.deleted_at IS NULL
  LEFT JOIN teachers t ON t.id = wrs.teacher_id AND t.deleted_at IS NULL
  LEFT JOIN groups   g ON g.id = wrs.group_id   AND g.deleted_at IS NULL
  LEFT JOIN subjects s ON s.id = g.subject_id   AND s.deleted_at IS NULL
  WHERE wrs.center_code = ? AND wrs.deleted_at IS NULL
  ORDER BY wrs.day_of_week, wrs.start_time
`;

/**
 * SQLite adapter for {@link WeeklyRecurringSessionRepository}. Pure translation
 * between the port and SQL — no business decisions. Reads hide tombstones;
 * `listChangedSince` (the sync feed) deliberately sees them. Identity columns
 * (`id`, `center_code`, `device_origin`, `created_at`) are never rewritten on
 * upsert.
 *
 * Implements two further read ports on the same instance (the join anchors on this
 * table): {@link RoomReferencePort} — the query the `ArchiveRoom` in-use guard needs
 * — and {@link WeeklySessionViewReadPort} — the planner grid's enriched week
 * (SOU-118). The composition root passes this one instance for all three.
 */
export class SqliteWeeklyRecurringSessionRepository
  implements WeeklyRecurringSessionRepository, RoomReferencePort, WeeklySessionViewReadPort
{
  constructor(
    private readonly db: DB,
    private readonly changeLog: ChangeLogWriter,
  ) {}

  async save(session: WeeklyRecurringSession): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare(SAVE_SQL).run({
        id: session.id,
        center_code: session.centerCode,
        device_origin: session.deviceOrigin,
        created_at: session.createdAt.toISOString(),
        updated_at: session.updatedAt.toISOString(),
        updated_by: session.updatedBy,
        deleted_at: session.deletedAt ? session.deletedAt.toISOString() : null,
        version: session.version,
        room_id: session.roomId,
        teacher_id: session.teacherId,
        group_id: session.groupId,
        day_of_week: session.dayOfWeek,
        start_time: session.start,
        end_time: session.end,
        active: session.active ? 1 : 0,
        valid_from: session.validFrom,
        valid_to: session.validTo,
      });
      this.changeLog.record({
        entityType: 'weekly_recurring_sessions',
        entityId: toEntityId(session.id),
        centerCode: session.centerCode,
        intent: 'upsert',
        entity: session,
      });
    })();
  }

  async findById(id: WeeklyRecurringSessionId): Promise<WeeklyRecurringSession | null> {
    const row = this.db
      .prepare('SELECT * FROM weekly_recurring_sessions WHERE id = ? AND deleted_at IS NULL')
      .get(id) as SessionRow | undefined;
    return row ? fromRow(row) : null;
  }

  async softDelete(id: WeeklyRecurringSessionId, at: Date, by: UserId): Promise<void> {
    const iso = at.toISOString();
    this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT * FROM weekly_recurring_sessions WHERE id = ?')
        .get(id) as SessionRow | undefined;
      if (!row) return;
      this.db
        .prepare(
          'UPDATE weekly_recurring_sessions SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?',
        )
        .run(iso, iso, by, id);
      this.changeLog.record({
        entityType: 'weekly_recurring_sessions',
        entityId: toEntityId(id),
        centerCode: row.center_code as CenterCode,
        intent: 'delete',
        entity: { ...fromRow(row), deletedAt: at, updatedAt: at, updatedBy: by },
      });
    })();
  }

  async listChangedSince(cursor: Date): Promise<readonly WeeklyRecurringSession[]> {
    const rows = this.db
      .prepare('SELECT * FROM weekly_recurring_sessions WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as SessionRow[];
    return rows.map(fromRow);
  }

  async listRefsForDay(
    centerCode: CenterCode,
    dayOfWeek: WeekdayIndex,
  ): Promise<readonly ScheduledSessionRef[]> {
    const rows = this.db
      .prepare(
        `SELECT id, room_id, teacher_id, day_of_week, start_time, end_time
           FROM weekly_recurring_sessions
          WHERE center_code = ? AND day_of_week = ? AND deleted_at IS NULL`,
      )
      .all(centerCode, dayOfWeek) as SessionRow[];
    return rows.map(toRef);
  }

  /** {@link WeeklySessionViewReadPort}: the planner grid's enriched week. */
  async listWeekView(centerCode: CenterCode): Promise<readonly WeeklySessionView[]> {
    const rows = this.db.prepare(LIST_WEEK_VIEW_SQL).all(centerCode) as SessionViewRow[];
    return rows.map(fromViewRow);
  }

  /** {@link RoomReferencePort}: true when any live session still books the room. */
  async hasActiveSessionForRoom(roomId: RoomId): Promise<boolean> {
    const row = this.db
      .prepare(
        'SELECT 1 FROM weekly_recurring_sessions WHERE room_id = ? AND deleted_at IS NULL LIMIT 1',
      )
      .get(roomId) as { 1: number } | undefined;
    return row !== undefined;
  }

  /** Active sessions bound to one group (SOU-176 seat-fit guard). */
  async listActiveByGroupId(
    centerCode: CenterCode,
    groupId: GroupId,
  ): Promise<readonly WeeklyRecurringSession[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM weekly_recurring_sessions
          WHERE center_code = ? AND group_id = ? AND deleted_at IS NULL
          ORDER BY day_of_week, start_time`,
      )
      .all(centerCode, groupId) as SessionRow[];
    return rows.map(fromRow);
  }

  /** Active sessions booked into one room (SOU-176 seat-fit guard). */
  async listActiveByRoomId(
    centerCode: CenterCode,
    roomId: RoomId,
  ): Promise<readonly WeeklyRecurringSession[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM weekly_recurring_sessions
          WHERE center_code = ? AND room_id = ? AND deleted_at IS NULL
          ORDER BY day_of_week, start_time`,
      )
      .all(centerCode, roomId) as SessionRow[];
    return rows.map(fromRow);
  }
}
