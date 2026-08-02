import type { Database as DB } from 'better-sqlite3';
import type {
  Session,
  SessionId,
  SessionRepository,
  WeeklyRecurringSessionId,
  CenterCode,
  DeviceId,
  UserId,
  EntityId,
  RoomId,
  GroupId,
  TimeOfDay,
  DateRange,
} from '@centresoutien/domain';

/** The `sessions` row shape as SQLite returns it. */
type SessionRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  recurring_session_id: string;
  room_id: string;
  teacher_id: string | null;
  group_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
};

function fromRow(row: SessionRow): Session {
  return {
    id: row.id as SessionId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    recurringSessionId: row.recurring_session_id as WeeklyRecurringSessionId,
    roomId: row.room_id as RoomId,
    teacherId: row.teacher_id === null ? null : (row.teacher_id as EntityId),
    groupId: row.group_id === null ? null : (row.group_id as GroupId),
    date: row.date,
    start: row.start_time as TimeOfDay,
    end: row.end_time as TimeOfDay,
  };
}

/** Bind a Session to the shared insert params. */
function toParams(session: Session): Record<string, string | number | null> {
  return {
    id: session.id,
    center_code: session.centerCode,
    device_origin: session.deviceOrigin,
    created_at: session.createdAt.toISOString(),
    updated_at: session.updatedAt.toISOString(),
    updated_by: session.updatedBy,
    deleted_at: session.deletedAt ? session.deletedAt.toISOString() : null,
    version: session.version,
    recurring_session_id: session.recurringSessionId,
    room_id: session.roomId,
    teacher_id: session.teacherId,
    group_id: session.groupId,
    date: session.date,
    start_time: session.start,
    end_time: session.end,
  };
}

const COLUMNS = `
  (id, center_code, device_origin, created_at, updated_at, updated_by,
   deleted_at, version, recurring_session_id, room_id, teacher_id, group_id,
   date, start_time, end_time)`;

const VALUES = `
  (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
   @deleted_at, @version, @recurring_session_id, @room_id, @teacher_id,
   @group_id, @date, @start_time, @end_time)`;

// Single-occurrence save (edit one materialized session — move room, reassign,
// re-time, or cancel via softDelete). Upsert on the ULID `id`: identity columns
// (id, center_code, device_origin, created_at) are never rewritten.
const SAVE_SQL = `
  INSERT INTO sessions ${COLUMNS}
  VALUES ${VALUES}
  ON CONFLICT(id) DO UPDATE SET
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by,
    deleted_at = excluded.deleted_at,
    version    = excluded.version,
    room_id    = excluded.room_id,
    teacher_id = excluded.teacher_id,
    group_id   = excluded.group_id,
    start_time = excluded.start_time,
    end_time   = excluded.end_time
`;

// Idempotent bulk insert from the generator. Conflict target is the NATURAL key
// (recurring_session_id, date), NOT the id: a re-run mints fresh ULIDs that
// collide on the natural key. DO NOTHING keeps the stored row untouched — no
// updated_at/version bump (so a re-run floods sync with nothing) and a cancelled
// (tombstoned) occurrence is never resurrected. New dates insert normally.
const UPSERT_MANY_SQL = `
  INSERT INTO sessions ${COLUMNS}
  VALUES ${VALUES}
  ON CONFLICT(recurring_session_id, date) DO NOTHING
`;

/**
 * SQLite adapter for {@link SessionRepository}. Pure translation between the port
 * and SQL — no business decisions. Reads hide tombstones; `listChangedSince` (the
 * sync feed) deliberately sees them. Identity columns are never rewritten on
 * upsert. `centerCode` is injected by the caller (main); this adapter never
 * crosses a tenant boundary.
 */
export class SqliteSessionRepository implements SessionRepository {
  constructor(private readonly db: DB) {}

  async save(session: Session): Promise<void> {
    this.db.prepare(SAVE_SQL).run(toParams(session));
  }

  async upsertMany(sessions: readonly Session[]): Promise<void> {
    const insert = this.db.prepare(UPSERT_MANY_SQL);
    const insertAll = this.db.transaction((batch: readonly Session[]) => {
      for (const session of batch) insert.run(toParams(session));
    });
    insertAll(sessions);
  }

  async findById(id: SessionId): Promise<Session | null> {
    const row = this.db
      .prepare('SELECT * FROM sessions WHERE id = ? AND deleted_at IS NULL')
      .get(id) as SessionRow | undefined;
    return row ? fromRow(row) : null;
  }

  async softDelete(id: SessionId, at: Date, by: UserId): Promise<void> {
    const iso = at.toISOString();
    this.db
      .prepare('UPDATE sessions SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?')
      .run(iso, iso, by, id);
  }

  async listChangedSince(cursor: Date): Promise<readonly Session[]> {
    const rows = this.db
      .prepare('SELECT * FROM sessions WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as SessionRow[];
    return rows.map(fromRow);
  }

  async listForRecurrence(
    recurringSessionId: WeeklyRecurringSessionId,
  ): Promise<readonly Session[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM sessions
          WHERE recurring_session_id = ? AND deleted_at IS NULL
          ORDER BY date`,
      )
      .all(recurringSessionId) as SessionRow[];
    return rows.map(fromRow);
  }

  async listForRange(
    centerCode: CenterCode,
    range: DateRange,
  ): Promise<readonly Session[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM sessions
          WHERE center_code = ? AND deleted_at IS NULL AND date BETWEEN ? AND ?
          ORDER BY date, start_time`,
      )
      .all(centerCode, range.start, range.end) as SessionRow[];
    return rows.map(fromRow);
  }
}
