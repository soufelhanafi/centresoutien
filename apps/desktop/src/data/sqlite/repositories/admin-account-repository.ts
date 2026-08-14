import type { Database as DB } from 'better-sqlite3';
import type { AdminAccount, AdminAccountId, AdminAccountRepository } from '@centresoutien/domain';
import { normalizeUsername } from '@centresoutien/domain';

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
// preserved. No change_log append here: owner-credential replication across
// devices is a later sync slice (admin credentials never synced pre-SOU-252), so
// the local owner login stays authoritative and lockout-free after a reset.
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

/**
 * Compatibility SQLite adapter for {@link AdminAccountRepository} (SOU-252): a
 * read/write view over the OWNER row of the `users` table. Pure translation —
 * no business decisions. `findByUsername` matches case-insensitively via
 * {@link normalizeUsername} (SOU-153) on live rows only.
 */
export class SqliteAdminAccountRepository implements AdminAccountRepository {
  constructor(private readonly db: DB) {}

  async exists(): Promise<boolean> {
    const row = this.db
      .prepare("SELECT 1 FROM users WHERE role = 'owner' AND deleted_at IS NULL LIMIT 1")
      .get();
    return row !== undefined;
  }

  async findByUsername(username: string): Promise<AdminAccount | null> {
    const row = this.db
      .prepare(
        'SELECT id, username, password_hash, created_at, updated_at FROM users WHERE username_normalized = ? AND deleted_at IS NULL',
      )
      .get(normalizeUsername(username)) as UserOwnerRow | undefined;
    return row ? fromRow(row) : null;
  }

  async findOnly(): Promise<AdminAccount | null> {
    const row = this.db
      .prepare(
        "SELECT id, username, password_hash, created_at, updated_at FROM users WHERE role = 'owner' AND deleted_at IS NULL LIMIT 1",
      )
      .get() as UserOwnerRow | undefined;
    return row ? fromRow(row) : null;
  }

  async save(account: AdminAccount): Promise<void> {
    this.db.prepare(ADMIN_ACCOUNT_SAVE_SQL).run(adminAccountToSaveParams(account));
  }
}
