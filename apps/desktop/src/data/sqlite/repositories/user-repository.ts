import type { Database as DB } from 'better-sqlite3';
import type {
  User,
  UserId,
  UserRepository,
  SetupCodeRedemption,
  Role,
  CenterCode,
  DeviceId,
  ChangeLogWriter,
} from '@centresoutien/domain';
import { toEntityId, normalizeUsername, isRole } from '@centresoutien/domain';

/** The `users` table row shape as SQLite returns it. */
type UserRow = {
  id: string;
  center_code: string;
  device_origin: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
  deleted_at: string | null;
  version: number;
  role: string;
  username: string;
  username_normalized: string;
  password_hash: string | null;
  setup_code_hash: string | null;
  setup_code_expires_at: number | null;
  setup_code_redeemed_at: string | null;
};

function toRole(value: string): Role {
  // Fail-closed (SOU-95): a role read from storage that is not a known token —
  // corruption or a downgrade past a future role — is rejected rather than
  // silently trusted, so an unknown value can never out-rank a real role.
  if (!isRole(value)) throw new Error(`users: unknown role "${value}"`);
  return value;
}

function fromRow(row: UserRow): User {
  return {
    id: row.id as UserId,
    centerCode: row.center_code as CenterCode,
    deviceOrigin: row.device_origin as DeviceId,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    updatedBy: row.updated_by as UserId,
    deletedAt: row.deleted_at === null ? null : new Date(row.deleted_at),
    version: row.version,
    role: toRole(row.role),
    username: row.username,
    passwordHash: row.password_hash,
    setupCodeHash: row.setup_code_hash,
    setupCodeExpiresAt: row.setup_code_expires_at,
    setupCodeRedeemedAt: row.setup_code_redeemed_at === null ? null : new Date(row.setup_code_redeemed_at),
  };
}

const SAVE_SQL = `
  INSERT INTO users
    (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at,
     version, role, username, username_normalized, password_hash,
     setup_code_hash, setup_code_expires_at, setup_code_redeemed_at)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by, @deleted_at,
     @version, @role, @username, @username_normalized, @password_hash,
     @setup_code_hash, @setup_code_expires_at, @setup_code_redeemed_at)
  ON CONFLICT(id) DO UPDATE SET
    updated_at             = excluded.updated_at,
    updated_by             = excluded.updated_by,
    deleted_at             = excluded.deleted_at,
    version                = excluded.version,
    role                   = excluded.role,
    username               = excluded.username,
    username_normalized    = excluded.username_normalized,
    password_hash          = excluded.password_hash,
    setup_code_hash        = excluded.setup_code_hash,
    setup_code_expires_at  = excluded.setup_code_expires_at,
    setup_code_redeemed_at = excluded.setup_code_redeemed_at
`;

function toSaveParams(user: User) {
  return {
    id: user.id,
    center_code: user.centerCode,
    device_origin: user.deviceOrigin,
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
    updated_by: user.updatedBy,
    deleted_at: user.deletedAt ? user.deletedAt.toISOString() : null,
    version: user.version,
    role: user.role,
    username: user.username,
    username_normalized: normalizeUsername(user.username),
    password_hash: user.passwordHash,
    setup_code_hash: user.setupCodeHash,
    setup_code_expires_at: user.setupCodeExpiresAt,
    setup_code_redeemed_at: user.setupCodeRedeemedAt ? user.setupCodeRedeemedAt.toISOString() : null,
  };
}

/**
 * SQLite adapter for {@link UserRepository}. Pure translation between the port
 * and SQL — no business decisions. Reads hide tombstones; `listChangedSince` (the
 * sync feed) includes them. Identity columns are never rewritten on upsert.
 * `username_normalized` is recomputed from `username` via {@link normalizeUsername}
 * on every save and is what `findByUsername` queries by — the DB never applies its
 * own casing rule (SQLite `COLLATE NOCASE` is ASCII-only and would not port to
 * Postgres). Each write appends to the change_log in the same transaction so a
 * user replicates to paired devices.
 */
export class SqliteUserRepository implements UserRepository {
  constructor(
    private readonly db: DB,
    private readonly changeLog: ChangeLogWriter,
  ) {}

  async save(user: User): Promise<void> {
    this.db.transaction(() => {
      this.db.prepare(SAVE_SQL).run(toSaveParams(user));
      this.changeLog.record({
        entityType: 'users',
        entityId: toEntityId(user.id),
        centerCode: user.centerCode,
        intent: 'upsert',
        entity: user,
      });
    })();
  }

  async findById(id: UserId): Promise<User | null> {
    const row = this.db
      .prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL')
      .get(id) as UserRow | undefined;
    return row ? fromRow(row) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const row = this.db
      .prepare('SELECT * FROM users WHERE username_normalized = ? AND deleted_at IS NULL')
      .get(normalizeUsername(username)) as UserRow | undefined;
    return row ? fromRow(row) : null;
  }

  async findOwner(): Promise<User | null> {
    const row = this.db
      .prepare("SELECT * FROM users WHERE role = 'owner' AND deleted_at IS NULL LIMIT 1")
      .get() as UserRow | undefined;
    return row ? fromRow(row) : null;
  }

  async listActive(centerCode: CenterCode): Promise<readonly User[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM users
          WHERE center_code = ? AND deleted_at IS NULL
          ORDER BY username COLLATE NOCASE, id`,
      )
      .all(centerCode) as UserRow[];
    return rows.map(fromRow);
  }

  async softDelete(id: UserId, at: Date, by: UserId): Promise<void> {
    const iso = at.toISOString();
    this.db.transaction(() => {
      const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
      if (!row) return;
      this.db
        .prepare('UPDATE users SET deleted_at = ?, updated_at = ?, updated_by = ? WHERE id = ?')
        .run(iso, iso, by, id);
      this.changeLog.record({
        entityType: 'users',
        entityId: toEntityId(id),
        centerCode: row.center_code as CenterCode,
        intent: 'delete',
        entity: { ...fromRow(row), deletedAt: at, updatedAt: at, updatedBy: by },
      });
    })();
  }

  async listChangedSince(cursor: Date): Promise<readonly User[]> {
    const rows = this.db
      .prepare('SELECT * FROM users WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as UserRow[];
    return rows.map(fromRow);
  }

  async markSetupCodeRedeemed(redemption: SetupCodeRedemption): Promise<boolean> {
    const iso = redemption.redeemedAt.toISOString();
    return this.db.transaction(() => {
      // Compare-and-set: only a row still pending on the verified hash (and not yet
      // redeemed) is updated. A concurrent redemption that already cleared the hash
      // matches zero rows, so the second attempt reports failure instead of
      // clobbering the first password.
      const info = this.db
        .prepare(
          `UPDATE users
              SET password_hash          = @password_hash,
                  setup_code_hash        = NULL,
                  setup_code_expires_at  = NULL,
                  setup_code_redeemed_at = @redeemed_at,
                  updated_at             = @redeemed_at,
                  updated_by             = @updated_by
            WHERE id = @id
              AND setup_code_hash = @expected_setup_code_hash
              AND setup_code_redeemed_at IS NULL
              AND deleted_at IS NULL`,
        )
        .run({
          id: redemption.id,
          expected_setup_code_hash: redemption.expectedSetupCodeHash,
          password_hash: redemption.passwordHash,
          redeemed_at: iso,
          updated_by: redemption.updatedBy,
        });
      if (info.changes === 0) return false;

      const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(redemption.id) as UserRow;
      this.changeLog.record({
        entityType: 'users',
        entityId: toEntityId(redemption.id),
        centerCode: row.center_code as CenterCode,
        intent: 'upsert',
        entity: fromRow(row),
      });
      return true;
    })();
  }
}
