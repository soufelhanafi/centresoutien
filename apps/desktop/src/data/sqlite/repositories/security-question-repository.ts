import type { Database as DB } from 'better-sqlite3';
import type {
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

export class SqliteSecurityQuestionRepository implements SecurityQuestionRepository {
  constructor(private readonly db: DB) {}

  async saveAll(questions: readonly SecurityQuestion[]): Promise<void> {
    const insert = this.db.prepare(INSERT_SQL);
    const tx = this.db.transaction(() => {
      // Hard delete intentional: security_questions is device-local, never synced,
      // and superseded answer hashes should not be retained. History is preserved
      // via the append-only auth_audit_log entry the caller records around this call.
      this.db.prepare('DELETE FROM security_questions').run();
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
    const rows = this.db.prepare('SELECT * FROM security_questions').all() as SecurityQuestionRow[];
    return rows.map(fromRow);
  }

  async exists(): Promise<boolean> {
    const row = this.db
      .prepare('SELECT COUNT(*) as cnt FROM security_questions')
      .get() as { cnt: number };
    return row.cnt > 0;
  }
}
