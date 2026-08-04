import type { Database as DB } from 'better-sqlite3';
import type {
  Clock,
  SecurityQuestion,
  SecurityQuestionId,
  SecurityQuestionKey,
  SecurityQuestionRepository,
} from '@centresoutien/domain';

type SecurityQuestionRow = {
  id: string;
  question_key: string;
  answer_hash: string;
  created_at: string;
  updated_at: string;
};

function fromRow(row: SecurityQuestionRow): SecurityQuestion {
  return {
    id: row.id as SecurityQuestionId,
    questionKey: row.question_key as SecurityQuestionKey,
    answerHash: row.answer_hash,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

const INSERT_SQL = `
  INSERT INTO security_questions (id, question_key, answer_hash, created_at, updated_at)
  VALUES (@id, @question_key, @answer_hash, @created_at, @updated_at)
`;

const SOFT_DELETE_ACTIVE_SQL = `
  UPDATE security_questions SET deleted_at = @deleted_at WHERE deleted_at IS NULL
`;

const SELECT_ACTIVE_SQL = `SELECT * FROM security_questions WHERE deleted_at IS NULL`;

export class SqliteSecurityQuestionRepository implements SecurityQuestionRepository {
  constructor(
    private readonly db: DB,
    private readonly clock: Clock,
  ) {}

  async saveAll(questions: readonly SecurityQuestion[]): Promise<void> {
    const insert = this.db.prepare(INSERT_SQL);
    const deletedAt = this.clock.now().toISOString();
    const tx = this.db.transaction(() => {
      // Superseded answer hashes are soft-deleted, not hard-deleted (CLAUDE.md
      // §13). History is preserved via the append-only auth_audit_log entry the
      // caller records around this call, plus the deleted_at trail here.
      this.db.prepare(SOFT_DELETE_ACTIVE_SQL).run({ deleted_at: deletedAt });
      for (const question of questions) {
        insert.run({
          id: question.id,
          question_key: question.questionKey,
          answer_hash: question.answerHash,
          created_at: question.createdAt.toISOString(),
          updated_at: question.updatedAt.toISOString(),
        });
      }
    });
    tx();
  }

  async findAll(): Promise<readonly SecurityQuestion[]> {
    const rows = this.db.prepare(SELECT_ACTIVE_SQL).all() as SecurityQuestionRow[];
    return rows.map(fromRow);
  }

  async exists(): Promise<boolean> {
    const row = this.db
      .prepare('SELECT COUNT(*) as cnt FROM security_questions WHERE deleted_at IS NULL')
      .get() as { cnt: number };
    return row.cnt > 0;
  }
}
