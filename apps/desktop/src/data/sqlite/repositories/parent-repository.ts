import type { Database as DB } from 'better-sqlite3';
import type {
  Parent,
  ParentId,
  ParentRepository,
  GuardianRelation,
  PhoneNumber,
  CenterCode,
  DeviceId,
  UserId,
} from '@centresoutien/domain';

/** The `parents` table row shape as SQLite returns it. */
type ParentRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  natural_key: string;
  name: string;
  phone: string;
  email: string | null;
  relation: string;
  whatsapp_opt_in: number;
};

function fromRow(row: ParentRow): Parent {
  return {
    id: row.id as ParentId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    naturalKey: row.natural_key,
    name: row.name,
    phone: row.phone as PhoneNumber,
    email: row.email,
    relation: row.relation as GuardianRelation,
    whatsappOptIn: row.whatsapp_opt_in === 1,
  };
}

const SAVE_SQL = `
  INSERT INTO parents
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, natural_key, name, phone, email, relation, whatsapp_opt_in)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @natural_key, @name, @phone, @email, @relation, @whatsapp_opt_in)
  ON CONFLICT(id) DO UPDATE SET
    updated_at      = excluded.updated_at,
    updated_by      = excluded.updated_by,
    deleted_at      = excluded.deleted_at,
    version         = excluded.version,
    name            = excluded.name,
    phone           = excluded.phone,
    email           = excluded.email,
    relation        = excluded.relation,
    whatsapp_opt_in = excluded.whatsapp_opt_in
`;

/**
 * SQLite adapter for {@link ParentRepository}. Pure translation between the port
 * and SQL — no business decisions. Reads hide tombstones; `listChangedSince`
 * (the sync feed) includes them. Identity columns and `natural_key` are never
 * rewritten on upsert — the matching key is immutable after creation.
 */
export class SqliteParentRepository implements ParentRepository {
  constructor(private readonly db: DB) {}

  async save(parent: Parent): Promise<void> {
    this.db.prepare(SAVE_SQL).run({
      id: parent.id,
      center_code: parent.centerCode,
      device_origin: parent.deviceOrigin,
      created_at: parent.createdAt.toISOString(),
      updated_at: parent.updatedAt.toISOString(),
      updated_by: parent.updatedBy,
      deleted_at: parent.deletedAt ? parent.deletedAt.toISOString() : null,
      version: parent.version,
      natural_key: parent.naturalKey,
      name: parent.name,
      phone: parent.phone,
      email: parent.email,
      relation: parent.relation,
      whatsapp_opt_in: parent.whatsappOptIn ? 1 : 0,
    });
  }

  async findById(id: ParentId): Promise<Parent | null> {
    const row = this.db
      .prepare('SELECT * FROM parents WHERE id = ? AND deleted_at IS NULL')
      .get(id) as ParentRow | undefined;
    return row ? fromRow(row) : null;
  }

  async findByNaturalKey(naturalKey: string): Promise<Parent | null> {
    const row = this.db
      .prepare('SELECT * FROM parents WHERE natural_key = ? AND deleted_at IS NULL')
      .get(naturalKey) as ParentRow | undefined;
    return row ? fromRow(row) : null;
  }

  async softDelete(id: ParentId, at: Date, by: UserId): Promise<void> {
    const iso = at.toISOString();
    this.db
      .prepare('UPDATE parents SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?')
      .run(iso, iso, by, id);
  }

  async listChangedSince(cursor: Date): Promise<readonly Parent[]> {
    const rows = this.db
      .prepare('SELECT * FROM parents WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as ParentRow[];
    return rows.map(fromRow);
  }

  async listActive(centerCode: CenterCode): Promise<readonly Parent[]> {
    const rows = this.db
      .prepare(
        'SELECT * FROM parents WHERE center_code = ? AND deleted_at IS NULL ORDER BY name COLLATE NOCASE, created_at',
      )
      .all(centerCode) as ParentRow[];
    return rows.map(fromRow);
  }
}
