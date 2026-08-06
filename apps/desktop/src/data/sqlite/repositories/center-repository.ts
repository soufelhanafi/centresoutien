import type { Database as DB } from 'better-sqlite3';
import type {
  Center,
  CenterId,
  CenterRepository,
  CenterCode,
  DeviceId,
  UserId,
  PlanId,
} from '@centresoutien/domain';

/** The `center` table row shape as SQLite returns it. */
type CenterRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  name: string;
  address: string;
  phone: string;
  email: string;
  logo_path: string | null;
  plan: string;
};

function fromRow(row: CenterRow): Center {
  return {
    id: row.id as CenterId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    name: row.name,
    address: row.address,
    phone: row.phone,
    email: row.email,
    logoPath: row.logo_path,
    plan: row.plan as PlanId,
  };
}

const SAVE_SQL = `
  INSERT INTO center
    (id, center_code, device_origin, created_at, updated_at, updated_by,
     deleted_at, version, name, address, phone, email, logo_path, plan, singleton)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by,
     @deleted_at, @version, @name, @address, @phone, @email, @logo_path, @plan, 1)
  ON CONFLICT(id) DO UPDATE SET
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by,
    deleted_at = excluded.deleted_at,
    version    = excluded.version,
    name       = excluded.name,
    address    = excluded.address,
    phone      = excluded.phone,
    email      = excluded.email,
    logo_path  = excluded.logo_path,
    plan       = excluded.plan
`;

/**
 * SQLite adapter for {@link CenterRepository}. Pure translation between the port
 * and SQL — no business decisions. The `singleton` guard keeps this to one live
 * row; `get` reads that row, and `save` upserts by id. Identity columns are
 * never rewritten on upsert.
 */
export class SqliteCenterRepository implements CenterRepository {
  constructor(private readonly db: DB) {}

  async get(): Promise<Center | null> {
    const row = this.db
      .prepare('SELECT * FROM center WHERE deleted_at IS NULL LIMIT 1')
      .get() as CenterRow | undefined;
    return row ? fromRow(row) : null;
  }

  async save(center: Center): Promise<void> {
    this.db.prepare(SAVE_SQL).run({
      id: center.id,
      center_code: center.centerCode,
      device_origin: center.deviceOrigin,
      created_at: center.createdAt.toISOString(),
      updated_at: center.updatedAt.toISOString(),
      updated_by: center.updatedBy,
      deleted_at: center.deletedAt ? center.deletedAt.toISOString() : null,
      version: center.version,
      name: center.name,
      address: center.address,
      phone: center.phone,
      email: center.email,
      logo_path: center.logoPath,
      plan: center.plan,
    });
  }

  async listChangedSince(cursor: Date): Promise<readonly Center[]> {
    const rows = this.db
      .prepare('SELECT * FROM center WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as CenterRow[];
    return rows.map(fromRow);
  }

  /**
   * Refreshes the display-only `plan` mirror from the license-resolved plan
   * (SOU-98). Deliberately NOT part of {@link CenterRepository}: it bypasses the
   * envelope, `version`, and change log because the plan is a per-device
   * license fact, not a synced profile edit — mirroring it through `save` would
   * bump the row and let one laptop's license overwrite another's. No-op when no
   * center row exists yet (first run seeds `plan` via SaveCenterProfile instead).
   */
  writePlanMirror(planId: PlanId): void {
    this.db
      .prepare("UPDATE center SET plan = ? WHERE deleted_at IS NULL AND plan <> ?")
      .run(planId, planId);
  }
}
