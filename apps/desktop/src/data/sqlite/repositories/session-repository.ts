import type { Database as DB } from 'better-sqlite3';
import type {
  Session,
  SessionId,
  SessionRepository,
  SessionOccurrenceViewReadPort,
  SessionOccurrenceView,
  GroupKind,
  SubjectId,
  WeeklyRecurringSessionId,
  CenterCode,
  DeviceId,
  UserId,
  EntityId,
  RoomId,
  GroupId,
  GenerationBatchId,
  TimeOfDay,
  DateRange,
  ChangeLogWriter,
} from '@centresoutien/domain';
import { toEntityId } from '@centresoutien/domain';

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
  generation_batch_id: string | null;
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
    generationBatchId:
      row.generation_batch_id === null ? null : (row.generation_batch_id as GenerationBatchId),
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
    generation_batch_id: session.generationBatchId,
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
   deleted_at, version, recurring_session_id, generation_batch_id, room_id,
   teacher_id, group_id, date, start_time, end_time)`;

const VALUES = `
  (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
   @deleted_at, @version, @recurring_session_id, @generation_batch_id, @room_id,
   @teacher_id, @group_id, @date, @start_time, @end_time)`;

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

/** One enriched dated-occurrence row: a session left-joined onto its room,
 *  teacher, group, and the group's subject. Join columns are NULL when the
 *  related row is missing or archived (`deleted_at IS NULL` is part of each
 *  join), so the mapper degrades them to the {@link SessionOccurrenceView}
 *  neutral fallback. The room is joined WITHOUT the tombstone filter so the
 *  audit can distinguish an archived room (SOU-296) from a not-yet-synced one:
 *  its name/capacity are CASE-gated to NULL, and `room_archived` is the flag. */
type OccurrenceViewRow = {
  id: string;
  recurring_session_id: string;
  date: string;
  start_time: string;
  end_time: string;
  room_id: string;
  room_name: string | null;
  room_capacity: number | null;
  room_archived: number;
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

/** Enriched-occurrence row → audit read model. Degrades missing/archived
 *  relations to the neutral fallback: NULL names/subject/level pass through as
 *  `null`, and an absent group `kind` falls back to `'regular'`. Mirrors the
 *  planner grid's `WeeklySessionView` mapper. */
function fromOccurrenceViewRow(row: OccurrenceViewRow): SessionOccurrenceView {
  return {
    id: row.id as SessionId,
    recurringSessionId: row.recurring_session_id as WeeklyRecurringSessionId,
    date: row.date,
    start: row.start_time as TimeOfDay,
    end: row.end_time as TimeOfDay,
    roomId: row.room_id as RoomId,
    roomName: row.room_name,
    roomCapacity: row.room_capacity,
    roomArchived: row.room_archived !== 0,
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

/**
 * Enriched active-occurrence read (SOU-201): every live dated session of the
 * center joined onto its room, teacher, group, and the group's subject. LEFT
 * JOINs so an occurrence with no live group/room/teacher is kept (degraded),
 * never dropped; the teacher/group/subject joins filter `deleted_at IS NULL` so
 * an archived relation reads as absent. The room is the exception (SOU-296): it
 * is joined WITHOUT the tombstone filter, and its name/capacity are CASE-gated to
 * NULL while `room_archived` flags the tombstone, so the audit can tell "archived"
 * from "not yet synced". The session itself must be live (`ses.deleted_at IS
 * NULL`) so a cancelled occurrence never surfaces in the audit. Bounded to
 * `ses.date >= ?` (the caller's today-forward floor) so SQLite skips historical
 * rows instead of the use case discarding them after the join. Ordered by date
 * then start time — the port's contract, served here without a re-sort.
 */
const LIST_ACTIVE_OCCURRENCE_VIEW_SQL = `
  SELECT
    ses.id                   AS id,
    ses.recurring_session_id AS recurring_session_id,
    ses.date                 AS date,
    ses.start_time           AS start_time,
    ses.end_time             AS end_time,
    ses.room_id              AS room_id,
    CASE WHEN r.deleted_at IS NULL THEN r.name     ELSE NULL END AS room_name,
    CASE WHEN r.deleted_at IS NULL THEN r.capacity ELSE NULL END AS room_capacity,
    CASE WHEN r.deleted_at IS NOT NULL THEN 1 ELSE 0 END          AS room_archived,
    ses.teacher_id           AS teacher_id,
    t.name_fr                AS teacher_name_fr,
    t.name_ar                AS teacher_name_ar,
    ses.group_id             AS group_id,
    g.subject_id             AS subject_id,
    s.name_fr                AS subject_name_fr,
    s.name_ar                AS subject_name_ar,
    g.level                  AS level,
    g.kind                   AS kind
  FROM sessions ses
  LEFT JOIN rooms    r ON r.id = ses.room_id
  LEFT JOIN teachers t ON t.id = ses.teacher_id AND t.deleted_at IS NULL
  LEFT JOIN groups   g ON g.id = ses.group_id   AND g.deleted_at IS NULL
  LEFT JOIN subjects s ON s.id = g.subject_id   AND s.deleted_at IS NULL
  WHERE ses.center_code = ? AND ses.deleted_at IS NULL AND ses.date >= ?
  ORDER BY ses.date, ses.start_time
`;

/**
 * SQLite adapter for {@link SessionRepository}. Pure translation between the port
 * and SQL — no business decisions. Reads hide tombstones; `listChangedSince` (the
 * sync feed) deliberately sees them. Identity columns are never rewritten on
 * upsert. `centerCode` is injected by the caller (main); this adapter never
 * crosses a tenant boundary.
 *
 * Implements {@link SessionOccurrenceViewReadPort} on the same instance (the join
 * anchors on the `sessions` table) — the enriched read the SOU-201 audit sweeps,
 * mirroring how its recurring-template sibling also serves
 * `WeeklySessionViewReadPort`.
 */
export class SqliteSessionRepository
  implements SessionRepository, SessionOccurrenceViewReadPort
{
  constructor(
    private readonly db: DB,
    private readonly changeLog: ChangeLogWriter,
  ) {}

  async save(session: Session): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare(SAVE_SQL).run(toParams(session));
      this.changeLog.record({
        entityType: 'sessions',
        entityId: toEntityId(session.id),
        centerCode: session.centerCode,
        intent: 'upsert',
        entity: session,
      });
    })();
  }

  async upsertMany(sessions: readonly Session[]): Promise<void> {
    const insert = this.db.prepare(UPSERT_MANY_SQL);
    // Mirror the ON CONFLICT(recurring_session_id, date) DO NOTHING semantics so a
    // re-run over already-materialized (or cancelled) dates logs nothing — a
    // phantom create would flood the change feed. Log only what this call inserted.
    const alreadyMaterialized = this.db.prepare(
      'SELECT 1 FROM sessions WHERE recurring_session_id = ? AND date = ? AND center_code = ? LIMIT 1',
    );
    const insertAll = this.db.transaction((batch: readonly Session[]) => {
      for (const session of batch) {
        if (alreadyMaterialized.get(session.recurringSessionId, session.date, session.centerCode)) continue;
        insert.run(toParams(session));
        this.changeLog.record({
          entityType: 'sessions',
          entityId: toEntityId(session.id),
          centerCode: session.centerCode,
          intent: 'upsert',
          entity: session,
        });
      }
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
    this.db.transaction(() => {
      const row = this.db
        .prepare('SELECT * FROM sessions WHERE id = ?')
        .get(id) as SessionRow | undefined;
      if (!row) return;
      this.db
        .prepare('UPDATE sessions SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?')
        .run(iso, iso, by, id);
      this.changeLog.record({
        entityType: 'sessions',
        entityId: toEntityId(id),
        centerCode: row.center_code as CenterCode,
        intent: 'delete',
        entity: { ...fromRow(row), deletedAt: at, updatedAt: at, updatedBy: by },
      });
    })();
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

  async listByGenerationBatch(
    centerCode: CenterCode,
    batchId: GenerationBatchId,
  ): Promise<readonly Session[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM sessions
          WHERE center_code = ? AND generation_batch_id = ? AND deleted_at IS NULL
          ORDER BY date, start_time`,
      )
      .all(centerCode, batchId) as SessionRow[];
    return rows.map(fromRow);
  }

  async listActiveOccurrenceViews(
    centerCode: CenterCode,
    fromDate: string,
  ): Promise<readonly SessionOccurrenceView[]> {
    const rows = this.db
      .prepare(LIST_ACTIVE_OCCURRENCE_VIEW_SQL)
      .all(centerCode, fromDate) as OccurrenceViewRow[];
    return rows.map(fromOccurrenceViewRow);
  }
}
