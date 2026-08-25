import type { Database as DB } from 'better-sqlite3';
import type {
  User,
  UserId,
  UserRepository,
  SetupCodeRedemption,
  SetupCodeReissue,
  Role,
  CenterCode,
  DeviceId,
  Email,
  ChangeLogWriter,
} from '@centresoutien/domain';
import { toEntityId, normalizeUsername, isRole, UsernameAlreadyTakenError } from '@centresoutien/domain';

/** The `users` table row shape as SQLite returns it. */
export type UserRow = {
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
  full_name: string | null;
  password_hash: string | null;
  setup_code_hash: string | null;
  setup_code_expires_at: number | null;
  setup_code_redeemed_at: string | null;
  email: string | null;
};

function toRole(value: string): Role {
  // Fail-closed (SOU-95): a role read from storage that is not a known token —
  // corruption or a downgrade past a future role — is rejected rather than
  // silently trusted, so an unknown value can never out-rank a real role.
  if (!isRole(value)) throw new Error(`users: unknown role "${value}"`);
  return value;
}

export function userRowToUser(row: UserRow): User {
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
    fullName: row.full_name,
    passwordHash: row.password_hash,
    setupCodeHash: row.setup_code_hash,
    setupCodeExpiresAt: row.setup_code_expires_at,
    setupCodeRedeemedAt: row.setup_code_redeemed_at === null ? null : new Date(row.setup_code_redeemed_at),
    email: row.email === null ? null : (row.email as Email),
  };
}

const SAVE_SQL = `
  INSERT INTO users
    (id, center_code, device_origin, created_at, updated_at, updated_by, deleted_at,
     version, role, username, username_normalized, full_name, password_hash,
     setup_code_hash, setup_code_expires_at, setup_code_redeemed_at, email)
  VALUES
    (@id, @center_code, @device_origin, @created_at, @updated_at, @updated_by, @deleted_at,
     @version, @role, @username, @username_normalized, @full_name, @password_hash,
     @setup_code_hash, @setup_code_expires_at, @setup_code_redeemed_at, @email)
  ON CONFLICT(id) DO UPDATE SET
    updated_at             = excluded.updated_at,
    updated_by             = excluded.updated_by,
    deleted_at             = excluded.deleted_at,
    version                = excluded.version,
    role                   = excluded.role,
    username               = excluded.username,
    username_normalized    = excluded.username_normalized,
    full_name              = excluded.full_name,
    password_hash          = excluded.password_hash,
    setup_code_hash        = excluded.setup_code_hash,
    setup_code_expires_at  = excluded.setup_code_expires_at,
    setup_code_redeemed_at = excluded.setup_code_redeemed_at,
    email                  = excluded.email
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
    full_name: user.fullName,
    password_hash: user.passwordHash,
    setup_code_hash: user.setupCodeHash,
    setup_code_expires_at: user.setupCodeExpiresAt,
    setup_code_redeemed_at: user.setupCodeRedeemedAt ? user.setupCodeRedeemedAt.toISOString() : null,
    email: user.email,
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
    return row ? userRowToUser(row) : null;
  }

  async findByUsername(username: string): Promise<User | null> {
    // Since 0053 dropped the live-username unique index, two devices that each
    // created the same account offline can leave two live rows with this
    // normalized username. `ORDER BY id DESC LIMIT 1` resolves the deterministic
    // winner (greatest ULID) every device agrees on — the read-side rule
    // teacher_availability / center_hours_overrides use — so login and the
    // owner-credential write always land on the same row.
    const row = this.db
      .prepare(
        'SELECT * FROM users WHERE username_normalized = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1',
      )
      .get(normalizeUsername(username)) as UserRow | undefined;
    return row ? userRowToUser(row) : null;
  }

  async findOwner(): Promise<User | null> {
    // Deterministic winner among any duplicate live owners (see findByUsername).
    const row = this.db
      .prepare("SELECT * FROM users WHERE role = 'owner' AND deleted_at IS NULL ORDER BY id DESC LIMIT 1")
      .get() as UserRow | undefined;
    return row ? userRowToUser(row) : null;
  }

  async participatesInSync(userId: UserId): Promise<boolean> {
    // The account participates in the sync feed when it was created through the
    // logging user repository (a `users` change_log row) or pulled from the hub
    // into `sync_local_entity`. A migrated owner — backfilled by migration 0044
    // with a device-local ULID and no change_log row — has neither, so its
    // credentials stay device-local (SOU-258): never part of the sync feed, so
    // not retroactively pushed.
    const logged = this.db
      .prepare("SELECT 1 FROM change_log WHERE entity_type = 'users' AND entity_id = ? LIMIT 1")
      .get(userId);
    if (logged !== undefined) return true;
    const synced = this.db
      .prepare("SELECT 1 FROM sync_local_entity WHERE entity_type = 'users' AND entity_id = ? LIMIT 1")
      .get(userId);
    return synced !== undefined;
  }

  async listPendingInvites(): Promise<readonly User[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM users
          WHERE deleted_at IS NULL
            AND setup_code_hash IS NOT NULL
            AND setup_code_redeemed_at IS NULL`,
      )
      .all() as UserRow[];
    return rows.map(userRowToUser);
  }

  async listActive(centerCode: CenterCode): Promise<readonly User[]> {
    // One row per live username: since 0053 dropped the unique index, two devices
    // that each created the same account offline can leave two live rows sharing a
    // normalized username. Collapse each such group to its deterministic winner
    // (greatest ULID, matching findByUsername) so the roster never shows the same
    // director twice. Pending role-only invites carry a per-row placeholder
    // username (their own id, migration 0052), so distinct invites never collapse.
    const rows = this.db
      .prepare(
        `SELECT * FROM users u
          WHERE u.center_code = @center_code AND u.deleted_at IS NULL
            AND u.id = (
              SELECT MAX(u2.id) FROM users u2
               WHERE u2.center_code = u.center_code
                 AND u2.deleted_at IS NULL
                 AND u2.username_normalized = u.username_normalized
            )
          ORDER BY u.username COLLATE NOCASE, u.id`,
      )
      .all({ center_code: centerCode }) as UserRow[];
    return rows.map(userRowToUser);
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
        entity: { ...userRowToUser(row), deletedAt: at, updatedAt: at, updatedBy: by },
      });
    })();
  }

  async listChangedSince(cursor: Date): Promise<readonly User[]> {
    const rows = this.db
      .prepare('SELECT * FROM users WHERE updated_at > ? ORDER BY updated_at')
      .all(cursor.toISOString()) as UserRow[];
    return rows.map(userRowToUser);
  }

  async markSetupCodeRedeemed(redemption: SetupCodeRedemption): Promise<boolean> {
    const iso = redemption.redeemedAt.toISOString();
    const { identity } = redemption;
    try {
      return this.db.transaction(() => {
        // Live-username race guard, now that 0053 dropped the unique index that
        // used to be the last resort. 0053 removed a HARD DB constraint (so a
        // peer's same-username row can sync-apply and converge at read), but a
        // LOCAL first onboarding must still not create a second live row for a
        // username another account already holds. better-sqlite3 is synchronous
        // and this runs inside the transaction, so the check + UPDATE are atomic:
        // an onboarding that slips past the use case's async pre-check is caught
        // here. Only when `identity` sets a username — a recovery (no identity)
        // never changes the username, so it cannot collide.
        if (identity) {
          const clash = this.db
            .prepare(
              `SELECT 1 FROM users
                WHERE username_normalized = @username_normalized
                  AND id != @id AND deleted_at IS NULL
                LIMIT 1`,
            )
            .get({ username_normalized: normalizeUsername(identity.username), id: redemption.id });
          if (clash !== undefined) throw new UsernameAlreadyTakenError(identity.username);
        }
        // Compare-and-set: only a row still pending on the verified hash (and not
        // yet redeemed) is updated. A concurrent redemption that already cleared the
        // hash matches zero rows, so the second attempt reports failure instead of
        // clobbering the first password. When `identity` is present (a first
        // onboarding) the same statement also writes the chosen username (+ its
        // recomputed normalized key), full name, and email; when absent only the
        // password is rotated (a director-reissued recovery code).
        const info = this.db
          .prepare(
            `UPDATE users
                SET password_hash          = @password_hash,
                    setup_code_hash        = NULL,
                    setup_code_expires_at  = NULL,
                    setup_code_redeemed_at = @redeemed_at,
                    updated_at             = @redeemed_at,
                    updated_by             = @updated_by,
                    username               = COALESCE(@username, username),
                    username_normalized    = COALESCE(@username_normalized, username_normalized),
                    full_name              = COALESCE(@full_name, full_name),
                    email                  = COALESCE(@email, email)
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
            username: identity?.username ?? null,
            username_normalized: identity ? normalizeUsername(identity.username) : null,
            full_name: identity?.fullName ?? null,
            email: identity?.email ?? null,
          });
        if (info.changes === 0) return false;

        const row = this.db
          .prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL')
          .get(redemption.id) as UserRow;
        this.changeLog.record({
          entityType: 'users',
          entityId: toEntityId(redemption.id),
          centerCode: row.center_code as CenterCode,
          intent: 'upsert',
          entity: userRowToUser(row),
        });
        return true;
      })();
    } catch (error) {
      // Defensive backstop: the primary same-username guard is now the
      // in-transaction re-check above (0053 dropped the unique index). Should any
      // other unique constraint on `users` ever reject a redemption write, still
      // surface it as the domain error the caller already handles.
      if (isUniqueConstraintViolation(error)) {
        throw new UsernameAlreadyTakenError(identity?.username ?? '');
      }
      throw error;
    }
  }

  async reopenSetupCode(reissue: SetupCodeReissue): Promise<User | null> {
    const iso = reissue.updatedAt.toISOString();
    return this.db.transaction(() => {
      // Targeted update: ONLY the setup-code fields + envelope change-tracking, on a
      // live row. Identity/credentials are never written here, so a re-issue racing
      // with a redemption cannot revert the chosen username/password.
      const info = this.db
        .prepare(
          `UPDATE users
              SET setup_code_hash        = @setup_code_hash,
                  setup_code_expires_at  = @setup_code_expires_at,
                  setup_code_redeemed_at = NULL,
                  updated_at             = @updated_at,
                  updated_by             = @updated_by
            WHERE id = @id
              AND deleted_at IS NULL`,
        )
        .run({
          id: reissue.id,
          setup_code_hash: reissue.setupCodeHash,
          setup_code_expires_at: reissue.setupCodeExpiresAt,
          updated_at: iso,
          updated_by: reissue.updatedBy,
        });
      if (info.changes === 0) return null;

      const row = this.db
        .prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL')
        .get(reissue.id) as UserRow;
      this.changeLog.record({
        entityType: 'users',
        entityId: toEntityId(reissue.id),
        centerCode: row.center_code as CenterCode,
        intent: 'upsert',
        entity: userRowToUser(row),
      });
      return userRowToUser(row);
    })();
  }
}

// better-sqlite3 tags a UNIQUE-index violation with this extended result code.
function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}
