import type { Database as DB } from 'better-sqlite3';
import type { RecoveryCode, RecoveryCodeId, RecoveryCodeRepository } from '@centresoutien/domain';

type RecoveryCodeRow = {
  id: string;
  code_hash: string;
  consumed: number;
  created_at: string;
  consumed_at: string | null;
};

function fromRow(row: RecoveryCodeRow): RecoveryCode {
  return {
    id: row.id as RecoveryCodeId,
    codeHash: row.code_hash,
    consumed: row.consumed === 1,
    createdAt: new Date(row.created_at),
    consumedAt: row.consumed_at ? new Date(row.consumed_at) : null,
  };
}

const SAVE_MANY_SQL = `
  INSERT INTO recovery_codes (id, code_hash, consumed, created_at)
  VALUES (@id, @code_hash, @consumed, @created_at)
`;

const CONSUME_SQL = `
  UPDATE recovery_codes
  SET consumed = 1, consumed_at = @consumed_at
  WHERE id = @id
`;

export class SqliteRecoveryCodeRepository implements RecoveryCodeRepository {
  constructor(private readonly db: DB) {}

  async saveMany(codes: readonly RecoveryCode[]): Promise<void> {
    const stmt = this.db.prepare(SAVE_MANY_SQL);
    const tx = this.db.transaction(() => {
      for (const code of codes) {
        stmt.run({
          id: code.id,
          code_hash: code.codeHash,
          consumed: 0,
          created_at: code.createdAt.toISOString(),
        });
      }
    });
    tx();
  }

  async findAllUnconsumed(): Promise<readonly RecoveryCode[]> {
    const rows = this.db
      .prepare('SELECT * FROM recovery_codes WHERE consumed = 0')
      .all() as RecoveryCodeRow[];
    return rows.map(fromRow);
  }

  async consumeById(id: RecoveryCode['id'], consumedAt: Date): Promise<void> {
    this.db.prepare(CONSUME_SQL).run({
      id,
      consumed_at: consumedAt.toISOString(),
    });
  }

  async invalidateAll(now: Date): Promise<void> {
    this.db.prepare("UPDATE recovery_codes SET consumed = 1, consumed_at = @now WHERE consumed = 0").run({
      now: now.toISOString(),
    });
  }

  async countUnconsumed(): Promise<number> {
    const row = this.db
      .prepare('SELECT COUNT(*) as cnt FROM recovery_codes WHERE consumed = 0')
      .get() as { cnt: number };
    return row.cnt;
  }
}
