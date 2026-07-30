import type { Database as DB } from 'better-sqlite3';
import type {
  WeeklyRecurringSession,
  WeeklyRecurringSessionId,
  WeeklyRecurringSessionRepository,
  RoomReferencePort,
  RoomId,
  ScheduledSessionRef,
  CenterCode,
  DeviceId,
  UserId,
  EntityId,
  WeekdayIndex,
  TimeOfDay,
} from '@centresoutien/domain';

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
  day_of_week: number;
  start_time: string;
  end_time: string;
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
    dayOfWeek: row.day_of_week as WeekdayIndex,
    start: row.start_time as TimeOfDay,
    end: row.end_time as TimeOfDay,
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
     deleted_at, version, room_id, teacher_id, day_of_week, start_time, end_time)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @room_id, @teacher_id, @day_of_week, @start_time, @end_time)
  ON CONFLICT(id) DO UPDATE SET
    updated_at  = excluded.updated_at,
    updated_by  = excluded.updated_by,
    deleted_at  = excluded.deleted_at,
    version     = excluded.version,
    room_id     = excluded.room_id,
    teacher_id  = excluded.teacher_id,
    day_of_week = excluded.day_of_week,
    start_time  = excluded.start_time,
    end_time    = excluded.end_time
`;

/**
 * SQLite adapter for {@link WeeklyRecurringSessionRepository}. Pure translation
 * between the port and SQL — no business decisions. Reads hide tombstones;
 * `listChangedSince` (the sync feed) deliberately sees them. Identity columns
 * (`id`, `center_code`, `device_origin`, `created_at`) are never rewritten on
 * upsert. Also satisfies {@link RoomReferencePort}: it owns the query the
 * `ArchiveRoom` in-use guard needs, so the composition root passes this same
 * instance as the room-reference adapter.
 */
export class SqliteWeeklyRecurringSessionRepository
  implements WeeklyRecurringSessionRepository, RoomReferencePort
{
  constructor(private readonly db: DB) {}

  async save(session: WeeklyRecurringSession): Promise<void> {
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
      day_of_week: session.dayOfWeek,
      start_time: session.start,
      end_time: session.end,
    });
  }

  async findById(id: WeeklyRecurringSessionId): Promise<WeeklyRecurringSession | null> {
    const row = this.db
      .prepare('SELECT * FROM weekly_recurring_sessions WHERE id = ? AND deleted_at IS NULL')
      .get(id) as SessionRow | undefined;
    return row ? fromRow(row) : null;
  }

  async softDelete(id: WeeklyRecurringSessionId, at: Date, by: UserId): Promise<void> {
    const iso = at.toISOString();
    this.db
      .prepare(
        'UPDATE weekly_recurring_sessions SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?',
      )
      .run(iso, iso, by, id);
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

  async listForWeek(centerCode: CenterCode): Promise<readonly WeeklyRecurringSession[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM weekly_recurring_sessions
          WHERE center_code = ? AND deleted_at IS NULL
          ORDER BY day_of_week, start_time`,
      )
      .all(centerCode) as SessionRow[];
    return rows.map(fromRow);
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
}
