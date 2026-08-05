import type { CenterCode, DeviceId, EntityId } from '../value-objects/ids';

/**
 * The recorded shape of a write in the append-only `change_log` (SOU-79). One
 * row per repository write. The log is the causal record from which the whole
 * database can be rebuilt (replay = ordered upserts of `payload`) and, later,
 * the feed the sync engine reads to apply changes on other devices.
 */
export type ChangeLogOp = 'create' | 'update' | 'delete';

/**
 * What a repository is doing to the row it just wrote. The concrete `op` is
 * derived from this plus the entity's revision — see {@link resolveChangeLogOp}:
 * a soft delete is always `delete`; a create/update `upsert` is `create` on the
 * first revision of the entity and `update` afterwards.
 */
export type ChangeLogIntent = 'upsert' | 'delete';

/** One append-only change_log entry — a full snapshot of a single entity write. */
export type ChangeLogEntry = {
  entityType: string;
  entityId: EntityId;
  revision: number;
  op: ChangeLogOp;
  /** Full entity snapshot as JSON, so replay is an ordered upsert per row. */
  payload: string;
  /** The laptop that made this write (the acting device, not the row's origin). */
  deviceId: DeviceId;
  createdAt: Date;
  centerCode: CenterCode;
};

/** What a repository hands the writer for one write. `entityId` is the opaque
 *  ULID key — typed `string` so any entity's specific branded id (SubjectId,
 *  StudentId, …) is accepted; the log is entity-type-erased. `entityType` names
 *  the entity. */
export type ChangeLogRecordInput = {
  entityType: string;
  entityId: string;
  centerCode: CenterCode;
  intent: ChangeLogIntent;
};

/**
 * Appends one row to the append-only change log for every repository write
 * (SOU-79). Adapters call this from inside the same database transaction as the
 * entity write, so a failed log append rolls the write back and vice versa —
 * the log can never fall out of step with the data.
 *
 * The implementation assigns `revision` as a per-`(entityType, entityId)`
 * monotonic counter (`MAX + 1`), stamps the acting `deviceId` and a UTC
 * `createdAt` from the Clock, and snapshots the just-written row as `payload`.
 * It is intentionally append-only: there is no update or delete method, and the
 * table's triggers reject those at the DB layer as a safety net.
 */
export interface ChangeLogWriter {
  record(input: ChangeLogRecordInput): void;
}

/**
 * The concrete `op` for a write: a `delete` intent is always `delete`; an
 * `upsert` is `create` on the entity's first revision and `update` after. Pure
 * so both the SQLite writer and a future backend writer resolve it identically.
 */
export function resolveChangeLogOp(intent: ChangeLogIntent, revision: number): ChangeLogOp {
  if (intent === 'delete') return 'delete';
  return revision <= 1 ? 'create' : 'update';
}
