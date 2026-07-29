import type { Database as DB } from 'better-sqlite3';
import type { AdminAccount, AdminAccountId, AdminAccountRepository } from '@centresoutien/domain';

/** The `admin_accounts` table row shape as SQLite returns it. */
type AdminAccountRow = {
  id: string;
  username: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
};

function fromRow(row: AdminAccountRow): AdminAccount {
  return {
    id: row.id as AdminAccountId,
    username: row.username,
    passwordHash: row.password_hash,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

const SAVE_SQL = `
  INSERT INTO admin_accounts
    (id, username, password_hash, created_at, updated_at)
  VALUES
    (@id, @username, @password_hash, @created_at, @updated_at)
  ON CONFLICT(id) DO UPDATE SET
    username      = excluded.username,
    password_hash = excluded.password_hash,
    updated_at    = excluded.updated_at
`;

/**
 * SQLite adapter for {@link AdminAccountRepository}. Pure translation between the
 * port and SQL — no business decisions. The account is local infra (not synced),
 * so there is no tombstone filter or sync feed. `created_at` is never rewritten
 * on upsert (a password change updates the hash and `updated_at` only).
 */
export class SqliteAdminAccountRepository implements AdminAccountRepository {
  constructor(private readonly db: DB) {}

  async exists(): Promise<boolean> {
    const row = this.db.prepare('SELECT 1 FROM admin_accounts LIMIT 1').get();
    return row !== undefined;
  }

  async findByUsername(username: string): Promise<AdminAccount | null> {
    const row = this.db
      .prepare('SELECT * FROM admin_accounts WHERE username = ?')
      .get(username) as AdminAccountRow | undefined;
    return row ? fromRow(row) : null;
  }

  async save(account: AdminAccount): Promise<void> {
    this.db.prepare(SAVE_SQL).run({
      id: account.id,
      username: account.username,
      password_hash: account.passwordHash,
      created_at: account.createdAt.toISOString(),
      updated_at: account.updatedAt.toISOString(),
    });
  }
}
