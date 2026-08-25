import type { Database as DB } from 'better-sqlite3';
import type {
  AdminAccount,
  AdminAccountId,
  AdminAccountRepository,
  CenterCode,
  ChangeLogWriter,
} from '@centresoutien/domain';
import { normalizeUsername, toEntityId } from '@centresoutien/domain';
import { userRowToUser, type UserRow } from './user-repository';

/**
 * The subset of a `users` row this compatibility view reads. SOU-252 retired the
 * `admin_accounts` table as the credential store: the owner now lives in `users`,
 * and login/create go through {@link UserRepository}. To avoid a second, divergent
 * credential store, the still-in-place SOU-31/SOU-169 flows (change password,
 * recovery-code reset) keep their {@link AdminAccountRepository} port but this
 * adapter now reads/writes the OWNER row of `users` — one credential source,
 * whichever path edits it. Repointing those use cases onto `UserRepository`
 * outright is a later SOU-252 slice.
 */
type UserOwnerRow = {
  id: string;
  username: string;
  password_hash: string | null;
  created_at: string;
  updated_at: string;
};

function fromRow(row: UserOwnerRow): AdminAccount {
  return {
    id: row.id as AdminAccountId,
    username: row.username,
    passwordHash: row.password_hash ?? '',
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// Owner password update, expressed against `users`. Exported so the atomic
// recovery-code reset unit-of-work (SOU-169) writes the password change through
// the same statement — one source of truth for the owner-credential write. Only
// the password + `updated_at`/`updated_by` change; identity/envelope are
// preserved.
export const ADMIN_ACCOUNT_SAVE_SQL = `
  UPDATE users
     SET password_hash = @password_hash,
         updated_at    = @updated_at,
         updated_by    = @id
   WHERE id = @id
`;

// Bind params for ADMIN_ACCOUNT_SAVE_SQL.
export function adminAccountToSaveParams(account: AdminAccount) {
  return {
    id: account.id,
    password_hash: account.passwordHash,
    updated_at: account.updatedAt.toISOString(),
  };
}

// The minimal credential write both the owner (change-password / recovery-code)
// and the per-user email reset (SOU-303) share: a `users` row id, its new hash, and
// the bumped timestamp. The email reset targets any account (owner or staff), so
// the shared helper is expressed in these generic terms, not the owner-only
// AdminAccount.
export type UserCredentialWrite = {
  readonly id: string;
  readonly passwordHash: string;
  readonly updatedAt: Date;
};

// Writes a user's credential and, when the DOMAIN says to replicate
// (`replicate`, SOU-258), appends a `users` change_log entry in the same
// transaction. The policy — which accounts participate in the sync feed — is
// computed by the use case (`participatesInSync`); this helper only persists the
// decision. Runs as plain statements so a UoW can wrap it with the session clear +
// audit atomically. `UPDATE users SET password_hash WHERE id` is generic by id, so
// it rotates the owner row or any staff row identically.
export function saveUserCredentialAndMaybeReplicate(
  db: DB,
  changeLog: ChangeLogWriter,
  credential: UserCredentialWrite,
  replicate: boolean,
): void {
  db.prepare(ADMIN_ACCOUNT_SAVE_SQL).run({
    id: credential.id,
    password_hash: credential.passwordHash,
    updated_at: credential.updatedAt.toISOString(),
  });
  if (!replicate) return;

  const row = db
    .prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL')
    .get(credential.id) as UserRow | undefined;
  if (!row) return;
  changeLog.record({
    entityType: 'users',
    entityId: toEntityId(credential.id),
    centerCode: row.center_code as CenterCode,
    intent: 'upsert',
    entity: userRowToUser(row),
  });
}

// The owner-scoped alias the change-password / recovery-code paths already call
// (SOU-258). Delegates to the generic write above — one write path per table.
export function saveOwnerCredentialAndMaybeReplicate(
  db: DB,
  changeLog: ChangeLogWriter,
  account: AdminAccount,
  replicate: boolean,
): void {
  saveUserCredentialAndMaybeReplicate(
    db,
    changeLog,
    { id: account.id, passwordHash: account.passwordHash, updatedAt: account.updatedAt },
    replicate,
  );
}

/**
 * Compatibility SQLite adapter for {@link AdminAccountRepository} (SOU-252): a
 * read/write view over the OWNER row of the `users` table. Pure translation —
 * no business decisions. `findByUsername` matches case-insensitively via
 * {@link normalizeUsername} (SOU-153) on live rows only.
 */
export class SqliteAdminAccountRepository implements AdminAccountRepository {
  constructor(
    private readonly db: DB,
    private readonly changeLog: ChangeLogWriter,
  ) {}

  async exists(): Promise<boolean> {
    const row = this.db
      .prepare("SELECT 1 FROM users WHERE role = 'owner' AND deleted_at IS NULL LIMIT 1")
      .get();
    return row !== undefined;
  }

  async findByUsername(username: string): Promise<AdminAccount | null> {
    // Owner-scoped, like `findOnly`/`exists`: this view only ever resolves the
    // owner. Without `role = 'owner'` an employee sharing (or colliding on) a
    // username could resolve here, and a subsequent owner password
    // `UPDATE … WHERE id = @id` would mutate that employee's row instead.
    // Deterministic winner (greatest ULID) among any duplicate live owner rows —
    // since 0053 dropped the live-username unique index, two devices that each
    // created the owner offline can leave two live rows, and every read must
    // resolve the SAME one so the owner-password `UPDATE … WHERE id` targets it
    // consistently on every device (matches SqliteUserRepository.findByUsername).
    const row = this.db
      .prepare(
        "SELECT id, username, password_hash, created_at, updated_at FROM users WHERE username_normalized = ? AND role = 'owner' AND deleted_at IS NULL ORDER BY id DESC LIMIT 1",
      )
      .get(normalizeUsername(username)) as UserOwnerRow | undefined;
    return row ? fromRow(row) : null;
  }

  async findOnly(): Promise<AdminAccount | null> {
    // Deterministic winner among any duplicate live owners (see findByUsername).
    const row = this.db
      .prepare(
        "SELECT id, username, password_hash, created_at, updated_at FROM users WHERE role = 'owner' AND deleted_at IS NULL ORDER BY id DESC LIMIT 1",
      )
      .get() as UserOwnerRow | undefined;
    return row ? fromRow(row) : null;
  }

  async participatesInSync(ownerId: AdminAccountId): Promise<boolean> {
    // The owner participates in the sync feed when it was created through the
    // logging user repository (a `users` change_log row) or pulled from the hub
    // into `sync_local_entity`. A migrated owner — backfilled by migration 0044
    // with a device-local ULID and no change_log row — has neither, so its
    // credentials stay device-local (SOU-258): never part of the sync feed.
    const logged = this.db
      .prepare("SELECT 1 FROM change_log WHERE entity_type = 'users' AND entity_id = ? LIMIT 1")
      .get(ownerId);
    if (logged !== undefined) return true;
    const synced = this.db
      .prepare("SELECT 1 FROM sync_local_entity WHERE entity_type = 'users' AND entity_id = ? LIMIT 1")
      .get(ownerId);
    return synced !== undefined;
  }

  async save(account: AdminAccount, options?: { readonly replicate: boolean }): Promise<void> {
    // The password write + its conditional change_log append commit together.
    this.db.transaction(() =>
      saveOwnerCredentialAndMaybeReplicate(this.db, this.changeLog, account, options?.replicate ?? false),
    )();
  }
}
