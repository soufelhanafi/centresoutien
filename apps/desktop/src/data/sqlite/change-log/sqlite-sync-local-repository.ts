import type { Database as DB } from 'better-sqlite3';
import type { Clock, DeviceId, CenterCode, EntityId, UserId } from '@centresoutien/domain';
import type { ChangeLogOp } from '@centresoutien/domain';
import type { SyncConflict } from '@centresoutien/domain';
import type {
  LocalEntityState,
  LocalPendingChange,
  LocalSyncRepository,
  SubjectCodeCollisionStore,
  SessionDedupStore,
  PaymentReversalDedupStore,
} from '@centresoutien/domain';
import { PAYMENT_ENTITY_TYPE, SESSION_ENTITY_TYPE } from '@centresoutien/domain';
import type { Payment, PaymentId } from '@centresoutien/domain';
import type { SyncCursor } from '@centresoutien/domain';
import type { ConflictSide } from '@centresoutien/domain';
import {
  getRegisteredChangeLogEntityProjection,
  getRegisteredChangeLogEntityToRowMapper,
} from './change-log-entity-mappers';
import { assertSqlIdentifier } from './table-identifier';

/**
 * Identity columns kept unchanged when an inbound payload is projected onto its
 * real table (SOU-180). Unlike replay's {@link IDENTITY_COLUMNS}, `version` is
 * NOT here: apply MUST advance the row to the canonical version. Apply is always
 * forward (the resolver skips `change.version <= local.version`, and a
 * hub-assigned version after a push is strictly higher), so writing it can never
 * roll a row back. `id`/`center_code`/`device_origin`/`created_at` are the
 * row's immutable provenance and stay as first written.
 */
const APPLY_IMMUTABLE_COLUMNS = new Set(['id', 'center_code', 'device_origin', 'created_at']);

const UPSERT_STATE_SQL = `
  INSERT INTO sync_local_entity
    (entity_type, entity_id, version, entity_json, pending_json, blocked, conflict_json, center_code)
  VALUES
    (@entity_type, @entity_id, @version, @entity_json, NULL, 0, NULL, @center_code)
  ON CONFLICT(entity_type, entity_id)
  DO UPDATE SET version = excluded.version, entity_json = excluded.entity_json,
                pending_json = NULL, blocked = 0, conflict_json = NULL
`;

const SELECT_STATE_SQL = `
  SELECT entity_type, entity_id, version, entity_json, pending_json, seq, blocked, conflict_json
    FROM sync_local_entity
   WHERE entity_type = ? AND entity_id = ?
`;

const SET_PENDING_SQL = `
  UPDATE sync_local_entity
     SET pending_json = @pending_json, blocked = 0, conflict_json = NULL,
         entity_json = @entity_json, version = @base_version, seq = @seq
   WHERE entity_type = @entity_type AND entity_id = @entity_id
`;

const BLOCK_SQL = `
  UPDATE sync_local_entity
     SET blocked = 1, conflict_json = @conflict_json
   WHERE entity_type = @entity_type AND entity_id = @entity_id
`;

const CLEAR_PENDING_SQL = `
  UPDATE sync_local_entity
     SET pending_json = NULL, blocked = 0, conflict_json = NULL
   WHERE entity_type = @entity_type AND entity_id = @entity_id
`;

const SELECT_PENDING_SQL = `
  SELECT entity_type, entity_id, version, entity_json, pending_json, seq, blocked, conflict_json
    FROM sync_local_entity
   WHERE center_code = ?
`;

const UPSERT_CURSOR_SQL = `
  INSERT INTO sync_cursor (device_id, center_code, seq)
  VALUES (@device_id, @center_code, @seq)
  ON CONFLICT(device_id, center_code) DO UPDATE SET seq = excluded.seq
`;

const SELECT_CURSOR_SQL = `
  SELECT seq FROM sync_cursor WHERE device_id = ? AND center_code = ?
`;

const FIND_LIVE_SUBJECT_ID_BY_CODE_SQL = `
  SELECT id FROM subjects
   WHERE center_code = ? AND code = ? AND id != ? AND deleted_at IS NULL
   LIMIT 1
`;

const CLEAR_SUBJECT_CODE_ROW_SQL = `
  UPDATE subjects SET code = NULL WHERE id = @id AND center_code = @center_code
`;

// json_set stores a SQL NULL argument as JSON null, so the shadow snapshot keeps
// the `code` key present but nulled — matching the projected row and what a later
// JSON.parse expects. pending_json (when present) mirrors it under $.entity.code
// so a queued push of the loser never re-introduces the freed code.
const CLEAR_SUBJECT_CODE_SHADOW_SQL = `
  UPDATE sync_local_entity
     SET entity_json = json_set(entity_json, '$.code', NULL),
         pending_json = CASE WHEN pending_json IS NULL THEN NULL
                             ELSE json_set(pending_json, '$.entity.code', NULL) END
   WHERE entity_type = 'subjects' AND entity_id = @entity_id AND center_code = @center_code
`;

const FIND_SESSION_BY_NATURAL_KEY_SQL = `
  SELECT id, deleted_at FROM sessions
   WHERE recurring_session_id = ? AND date = ? AND id != ?
     AND center_code = ?
   LIMIT 1
`;

const LAST_LOCAL_SIDE_SQL = `
  SELECT op, device_id, created_at, revision, payload FROM change_log
   WHERE entity_type = ? AND entity_id = ? AND center_code = ?
   ORDER BY rowid DESC LIMIT 1
`;

const RE_POINT_ATTENDANCE_SQL = `
  UPDATE attendance_records SET session_id = @to_id
   WHERE session_id = @from_id AND center_code = @center_code
`;

const NEUTRALIZE_SESSION_SHADOW_SQL = `
  UPDATE sync_local_entity
     SET pending_json = NULL, blocked = 0, conflict_json = NULL,
         version = @version, entity_json = @entity_json
   WHERE entity_type = 'sessions' AND entity_id = @entity_id AND center_code = @center_code
`;

/**
 * SQLite {@link LocalSyncRepository} (SOU-91) — the device side of the sync
 * cycle and the durable "conflits en attente" store. One row per entity in
 * `sync_local_entity` (migration 0037) mirrors the in-memory repository's
 * StoredState: canonical version + snapshot, optional unsynced pending write,
 * optional blocked conflict. `change_log` is append-only (0036 triggers forbid
 * UPDATE/DELETE) so a blocked flag cannot live there.
 *
 * UPDATE-only by construction: clearing a pending/blocked write NULLs the
 * columns rather than DELETEing the row, honoring the no-hard-delete rule even
 * for this device-local bookkeeping. One instance per open center DB (bound by
 * constructor to its `centerCode`), so every query is tenant-scoped.
 *
 * Entity snapshots are stored as domain-shape JSON — the same shape
 * `change_log.payload.entity` carries — so the adapter never guesses a physical
 * row. `conflict_json` holds the serialized `SyncConflict` (Dates become ISO
 * strings) that the inbox re-surfaces.
 */
export class SqliteLocalSyncRepository
  implements LocalSyncRepository, SubjectCodeCollisionStore, SessionDedupStore, PaymentReversalDedupStore
{
  private readonly centerCode: CenterCode;
  private seqCounter: number;

  constructor(
    private readonly db: DB,
    private readonly clock: Clock,
    private readonly deviceId: DeviceId,
    centreId: CenterCode,
  ) {
    this.centerCode = centreId;
    this.seqCounter = this.readMaxSeq();
  }

  getLocalState(entityType: string, entityId: EntityId): LocalEntityState | null {
    const row = this.db.prepare(SELECT_STATE_SQL).get(entityType, entityId) as
      | PendingRow
      | undefined;
    if (!row) return null;
    return {
      version: row.version,
      entity: JSON.parse(row.entity_json) as Record<string, unknown>,
      pending: row.pending_json ? this.pendingFromRow(row) : null,
    };
  }

  applyInbound(entityType: string, entityId: EntityId, entity: Record<string, unknown>, version: number): void {
    this.db.transaction(() => {
      this.db.prepare(UPSERT_STATE_SQL).run({
        entity_type: entityType,
        entity_id: entityId,
        version,
        entity_json: JSON.stringify(entity),
        center_code: this.centerCode,
      });
      // Reflect the applied canonical state onto the real entity table so the
      // app's own screens see pulled data — the shadow store alone is invisible.
      this.projectToEntityTable(entityType, { ...entity, version });
    })();
  }

  upsertPending(input: {
    entityType: string;
    entityId: EntityId;
    deviceId: DeviceId;
    entity: Record<string, unknown>;
    changedFields: readonly string[];
    baseVersion: number;
    op: ChangeLogOp;
    updatedBy: UserId;
    at: Date;
  }): void {
    this.seqCounter++;
    const pending = {
      baseVersion: input.baseVersion,
      op: input.op,
      entity: input.entity,
      changedFields: [...input.changedFields],
      seq: this.seqCounter,
      at: input.at.toISOString(),
      updatedBy: input.updatedBy,
    };
    // The row may not exist yet (a fresh pending write with no canonical base):
    // upsert canonical state first, then stamp the pending write.
    this.db.prepare(UPSERT_STATE_SQL).run({
      entity_type: input.entityType,
      entity_id: input.entityId,
      version: input.baseVersion,
      entity_json: JSON.stringify(input.entity),
      center_code: this.centerCode,
    });
    this.db.prepare(SET_PENDING_SQL).run({
      entity_type: input.entityType,
      entity_id: input.entityId,
      pending_json: JSON.stringify(pending),
      entity_json: JSON.stringify(input.entity),
      base_version: input.baseVersion,
      seq: this.seqCounter,
    });
  }

  markSynced(entityType: string, entityId: EntityId, assignedVersion: number): void {
    const state = this.getLocalState(entityType, entityId);
    if (!state) return;
    this.db.transaction(() => {
      this.db.prepare(UPSERT_STATE_SQL).run({
        entity_type: entityType,
        entity_id: entityId,
        version: assignedVersion,
        entity_json: JSON.stringify({ ...state.entity, version: assignedVersion }),
        center_code: this.centerCode,
      });
      this.db.prepare(CLEAR_PENDING_SQL).run({ entity_type: entityType, entity_id: entityId });
      // Stamp the hub-assigned version onto the real row. For a merged auto-resolve
      // this is also where the merged field values first reach the entity table.
      this.projectToEntityTable(entityType, { ...state.entity, version: assignedVersion });
    })();
  }

  blockPending(entityType: string, entityId: EntityId, conflict?: SyncConflict): void {
    this.db.prepare(BLOCK_SQL).run({
      entity_type: entityType,
      entity_id: entityId,
      conflict_json: conflict ? JSON.stringify(serializeConflict(conflict)) : null,
    });
  }

  listBlocked(): readonly SyncConflict[] {
    const rows = this.db.prepare(SELECT_PENDING_SQL).all(this.centerCode) as PendingRow[];
    const conflicts: SyncConflict[] = [];
    for (const row of rows) {
      if (row.blocked === 0 || !row.conflict_json) continue;
      conflicts.push(deserializeConflict(row.conflict_json));
    }
    return conflicts;
  }

  resolveBlocked(input: {
    entityType: string;
    entityId: EntityId;
    entity: Record<string, unknown>;
    changedFields: readonly string[];
    baseVersion: number;
    op: ChangeLogOp;
    updatedBy: UserId;
    at: Date;
  }): void {
    this.upsertPending({
      entityType: input.entityType,
      entityId: input.entityId,
      deviceId: this.deviceId,
      entity: input.entity,
      changedFields: input.changedFields,
      baseVersion: input.baseVersion,
      op: input.op,
      updatedBy: input.updatedBy,
      at: input.at,
    });
  }

  listPending(): readonly LocalPendingChange[] {
    const rows = this.db.prepare(SELECT_PENDING_SQL).all(this.centerCode) as PendingRow[];
    return rows
      .filter((row) => row.pending_json !== null && row.blocked === 0)
      .map((row) => this.pendingFromRow(row));
  }

  getCursor(): SyncCursor | null {
    const row = this.db.prepare(SELECT_CURSOR_SQL).get(this.deviceId, this.centerCode) as
      | { seq: number }
      | undefined;
    return row ? { seq: row.seq } : null;
  }

  setCursor(cursor: SyncCursor): void {
    this.db.prepare(UPSERT_CURSOR_SQL).run({
      device_id: this.deviceId,
      center_code: this.centerCode,
      seq: cursor.seq,
    });
  }

  findLiveSubjectIdByCode(centerCode: CenterCode, code: string, excludeId: EntityId): EntityId | null {
    const row = this.db.prepare(FIND_LIVE_SUBJECT_ID_BY_CODE_SQL).get(centerCode, code, excludeId) as
      | { id: string }
      | undefined;
    return row ? (row.id as EntityId) : null;
  }

  clearSubjectCode(entityId: EntityId): void {
    this.db.transaction(() => {
      this.db.prepare(CLEAR_SUBJECT_CODE_ROW_SQL).run({ id: entityId, center_code: this.centerCode });
      this.db.prepare(CLEAR_SUBJECT_CODE_SHADOW_SQL).run({
        entity_id: entityId,
        center_code: this.centerCode,
      });
    })();
  }

  findSessionByNaturalKey(
    recurringSessionId: string,
    date: string,
    excludeId: EntityId,
  ): { id: EntityId; deletedAt: string | null } | null {
    const row = this.db.prepare(FIND_SESSION_BY_NATURAL_KEY_SQL).get(
      recurringSessionId,
      date,
      excludeId,
      this.centerCode,
    ) as { id: string; deleted_at: string | null } | undefined;
    return row ? { id: row.id as EntityId, deletedAt: row.deleted_at } : null;
  }

  lastLocalSide(entityId: EntityId): ConflictSide | null {
    const row = this.db.prepare(LAST_LOCAL_SIDE_SQL).get(
      SESSION_ENTITY_TYPE,
      entityId,
      this.centerCode,
    ) as
      | { op: string; device_id: string; created_at: string; revision: number; payload: string }
      | undefined;
    if (!row) return null;
    let entity: Record<string, unknown>;
    try {
      entity = (JSON.parse(row.payload) as { entity: Record<string, unknown> }).entity;
    } catch {
      return null;
    }
    return {
      updatedBy: (entity['updatedBy'] as UserId | undefined) ?? (row.device_id as UserId),
      deviceId: row.device_id as DeviceId,
      op: row.op as ChangeLogOp,
      seq: row.revision,
      at: new Date(row.created_at),
      changedFields: [],
      entity,
    };
  }

  findPaymentReversalByTarget(reversesPaymentId: PaymentId, excludeId: EntityId): Payment | null {
    const row = this.db
      .prepare(
        `SELECT * FROM payments
          WHERE center_code = ? AND kind = 'reversal' AND reverses_payment_id = ?
            AND id != ? AND deleted_at IS NULL
          ORDER BY id LIMIT 1`,
      )
      .get(this.centerCode, reversesPaymentId, excludeId) as PaymentRow | undefined;
    return row ? paymentFromRow(row) : null;
  }

  /**
   * Inbound wins (lower ULID): rewrite the local loser row in place to become
   * the winner — the natural-key slot is occupied and stays occupied (the unique
   * index is non-partial), so the winner's INSERT would throw; the UPDATE moves
   * the row to the winner's id + data + version instead. Attendance that
   * referenced the loser id is re-pointed, and the loser's shadow entry is
   * neutralized so its pending push can never resurrect it.
   */
  absorbSessionAsWinner(input: {
    fromId: EntityId;
    toId: EntityId;
    entity: Record<string, unknown>;
    version: number;
  }): void {
    this.db.transaction(() => {
      this.rewriteSessionRowInPlace(input.fromId, input.toId, input.entity, input.version);
      this.db.prepare(RE_POINT_ATTENDANCE_SQL).run({
        to_id: input.toId,
        from_id: input.fromId,
        center_code: this.centerCode,
      });
      this.db.prepare(UPSERT_STATE_SQL).run({
        entity_type: SESSION_ENTITY_TYPE,
        entity_id: input.toId,
        version: input.version,
        entity_json: JSON.stringify({ ...input.entity, version: input.version }),
        center_code: this.centerCode,
      });
      this.db.prepare(NEUTRALIZE_SESSION_SHADOW_SQL).run({
        entity_id: input.fromId,
        version: input.version,
        entity_json: JSON.stringify({ ...input.entity, version: input.version }),
        center_code: this.centerCode,
      });
    })();
  }

  /**
   * Inbound loses (higher ULID): keep the local winner row untouched. Record
   * the inbound loser's version in the shadow (so re-delivery is skipped), and
   * defensively re-point any attendance that references the retired id (normally
   * a no-op — the retired row never existed locally).
   */
  retireInboundSession(input: {
    keptId: EntityId;
    retiredId: EntityId;
    entity: Record<string, unknown>;
    version: number;
  }): void {
    this.db.transaction(() => {
      this.db.prepare(UPSERT_STATE_SQL).run({
        entity_type: SESSION_ENTITY_TYPE,
        entity_id: input.retiredId,
        version: input.version,
        entity_json: JSON.stringify({ ...input.entity, version: input.version }),
        center_code: this.centerCode,
      });
      this.db.prepare(RE_POINT_ATTENDANCE_SQL).run({
        to_id: input.keptId,
        from_id: input.retiredId,
        center_code: this.centerCode,
      });
    })();
  }

  /**
   * A human settled a session natural-key conflict (SOU-194) — the resolution
   * of a delete-vs-edit / field-clash that blocked on the local occupied row.
   * The chosen data survives under the lower-ULID winner id: when the loser is
   * local (`fromId`), the row is rewritten in place to the winner id + chosen
   * data and its attendance re-pointed; the loser's shadow is retired (block
   * cleared, version recorded so re-delivery is skipped); and the choice is
   * stored as a fresh pending push under the winner id. The natural-key slot
   * never frees, so the subsequent `markSynced` projection updates the winner
   * row instead of INSERTing into a slot the loser still holds.
   */
  resolveSessionNaturalKey(input: {
    fromId: EntityId;
    winnerId: EntityId;
    loserId: EntityId;
    entity: Record<string, unknown>;
    inboundVersion: number;
    baseVersion: number;
    op: ChangeLogOp;
    changedFields: readonly string[];
    updatedBy: UserId;
    at: Date;
  }): void {
    this.db.transaction(() => {
      if (input.fromId !== input.winnerId) {
        this.rewriteSessionRowInPlace(input.fromId, input.winnerId, input.entity, input.baseVersion);
        this.db.prepare(RE_POINT_ATTENDANCE_SQL).run({
          to_id: input.winnerId,
          from_id: input.fromId,
          center_code: this.centerCode,
        });
      }
      this.db.prepare(UPSERT_STATE_SQL).run({
        entity_type: SESSION_ENTITY_TYPE,
        entity_id: input.loserId,
        version: input.inboundVersion,
        entity_json: JSON.stringify({ ...input.entity, id: input.loserId, version: input.inboundVersion }),
        center_code: this.centerCode,
      });
      this.db.prepare(UPSERT_STATE_SQL).run({
        entity_type: SESSION_ENTITY_TYPE,
        entity_id: input.winnerId,
        version: input.baseVersion,
        entity_json: JSON.stringify({ ...input.entity, version: input.baseVersion }),
        center_code: this.centerCode,
      });
      const pending = {
        baseVersion: input.baseVersion,
        op: input.op,
        entity: { ...input.entity, version: input.baseVersion },
        changedFields: [...input.changedFields],
        seq: ++this.seqCounter,
        at: input.at.toISOString(),
        updatedBy: input.updatedBy,
      };
      this.db.prepare(SET_PENDING_SQL).run({
        entity_type: SESSION_ENTITY_TYPE,
        entity_id: input.winnerId,
        pending_json: JSON.stringify(pending),
        entity_json: JSON.stringify({ ...input.entity, version: input.baseVersion }),
        base_version: input.baseVersion,
        seq: this.seqCounter,
      });
    })();
  }

  private rewriteSessionRowInPlace(
    fromId: EntityId,
    toId: EntityId,
    entity: Record<string, unknown>,
    version: number,
  ): void {
    const mapper = getRegisteredChangeLogEntityToRowMapper(SESSION_ENTITY_TYPE);
    if (!mapper) {
      throw new Error(
        `sessions entity→row mapper not registered — cannot settle session natural-key collision`,
      );
    }
    const row = mapper({ ...entity, version });
    const columns = Object.keys(row).map(assertSqlIdentifier);
    const sets = columns.map((column) => `${column} = @${column}`).join(', ');
    this.db
      .prepare(`UPDATE sessions SET ${sets} WHERE id = @from_id AND center_code = @center_code`)
      .run({ ...row, from_id: fromId, center_code: this.centerCode });
  }

  /**
   * Upsert an applied domain snapshot onto its real entity table so the app's
   * own reads see synced data. Uses the explicitly registered domain→row mapper
   * only (a synced payload is always the nested domain shape); an entityType
   * without one is simply not projected yet. On conflict, every column is
   * refreshed except the immutable provenance ({@link APPLY_IMMUTABLE_COLUMNS}) —
   * `version` advances, `deleted_at` carries tombstones through.
   */
  private projectToEntityTable(entityType: string, entity: Record<string, unknown>): void {
    const projection = getRegisteredChangeLogEntityProjection(entityType);
    if (!projection) return;
    const table = assertSqlIdentifier(entityType);
    const row = projection.mapper(entity);
    const columns = Object.keys(row).map(assertSqlIdentifier);
    if (projection.mode === 'append-only') {
      this.prepareAppendOnlyProjection(entityType, row);
      const sql = `
        INSERT INTO ${table} (${columns.join(', ')})
        VALUES (${columns.map((column) => `@${column}`).join(', ')})
        ON CONFLICT(id) DO NOTHING
      `;
      this.db.prepare(sql).run(row);
      return;
    }
    const updatable = columns.filter((column) => !APPLY_IMMUTABLE_COLUMNS.has(column));
    const sql = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES (${columns.map((column) => `@${column}`).join(', ')})
      ON CONFLICT(id) DO UPDATE SET ${updatable.map((column) => `${column} = excluded.${column}`).join(', ')}
    `;
    this.db.prepare(sql).run(row);
  }

  private prepareAppendOnlyProjection(entityType: string, row: Record<string, unknown>): void {
    if (
      entityType !== PAYMENT_ENTITY_TYPE ||
      row['kind'] !== 'reversal' ||
      typeof row['reverses_payment_id'] !== 'string' ||
      typeof row['id'] !== 'string'
    ) {
      return;
    }
    const existing = this.db
      .prepare(
        `SELECT id FROM payments
          WHERE center_code = ? AND kind = 'reversal' AND reverses_payment_id = ?
            AND id != ? AND deleted_at IS NULL
          LIMIT 1`,
      )
      .get(this.centerCode, row['reverses_payment_id'], row['id']) as { id: string } | undefined;
    if (existing) {
      this.db.prepare('DROP INDEX IF EXISTS ux_payments_reversal_once').run();
    }
  }

  private pendingFromRow(row: PendingRow): LocalPendingChange {
    const pending = row.pending_json
      ? (JSON.parse(row.pending_json) as PendingEnvelope)
      : null;
    return {
      entityType: row.entity_type,
      entityId: row.entity_id as EntityId,
      deviceId: this.deviceId,
      baseVersion: pending?.baseVersion ?? row.version,
      op: pending?.op ?? 'update',
      entity: (pending?.entity ?? JSON.parse(row.entity_json)) as Record<string, unknown>,
      changedFields: pending?.changedFields ?? [],
      seq: pending?.seq ?? row.seq,
      at: pending ? new Date(pending.at) : this.clock.now(),
      updatedBy: (pending?.updatedBy ?? '') as UserId,
    };
  }

  private readMaxSeq(): number {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM sync_local_entity')
      .get() as { seq: number };
    return row.seq;
  }
}

type PendingRow = {
  entity_type: string;
  entity_id: string;
  version: number;
  entity_json: string;
  pending_json: string | null;
  seq: number;
  blocked: number;
  conflict_json: string | null;
};

/** The compact pending-write envelope stored in `sync_local_entity.pending_json`. */
type PendingEnvelope = {
  baseVersion: number;
  op: ChangeLogOp;
  entity: Record<string, unknown>;
  changedFields: readonly string[];
  seq: number;
  at: string;
  updatedBy: string;
};

type PaymentRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  invoice_id: string;
  kind: string;
  amount_mad: number;
  method: string;
  paid_on: string;
  reverses_payment_id: string | null;
  note: string | null;
};

function paymentFromRow(row: PaymentRow): Payment {
  return {
    id: row.id as PaymentId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    invoiceId: row.invoice_id as Payment['invoiceId'],
    kind: row.kind as Payment['kind'],
    amountMad: row.amount_mad,
    method: row.method as Payment['method'],
    paidOn: row.paid_on,
    reversesPaymentId: row.reverses_payment_id === null ? null : (row.reverses_payment_id as PaymentId),
    note: row.note,
  };
}

/** Serialize a SyncConflict for storage — Dates become ISO strings. */
function serializeConflict(conflict: SyncConflict): unknown {
  return JSON.parse(
    JSON.stringify(conflict, (_key, value) => (value instanceof Date ? value.toISOString() : value)),
  );
}

/** Deserialize a stored conflict — ISO strings become Dates again. */
function deserializeConflict(raw: string): SyncConflict {
  const parsed: unknown = JSON.parse(raw);
  return reviveConflict(parsed as SyncConflict);
}

function reviveConflict(conflict: SyncConflict): SyncConflict {
  switch (conflict.kind) {
    case 'field-clash':
      return {
        ...conflict,
        mine: { ...conflict.mine, at: new Date(conflict.mine.at as unknown as string) },
        theirs: { ...conflict.theirs, at: new Date(conflict.theirs.at as unknown as string) },
      };
    case 'delete-vs-edit':
      return {
        ...conflict,
        mine: { ...conflict.mine, at: new Date(conflict.mine.at as unknown as string) },
        theirs: { ...conflict.theirs, at: new Date(conflict.theirs.at as unknown as string) },
      };
    case 'probable-duplicate':
      return conflict;
  }
}
