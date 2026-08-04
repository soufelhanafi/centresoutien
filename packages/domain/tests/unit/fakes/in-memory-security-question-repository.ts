import type { SecurityQuestionRepository } from '../../../src/ports/security-question-repository';
import type { SecurityQuestion } from '../../../src/entities/security-question';

export class InMemorySecurityQuestionRepository implements SecurityQuestionRepository {
  private rows: SecurityQuestion[] = [];

  async saveAll(questions: readonly SecurityQuestion[]): Promise<void> {
    this.rows = questions.map((q) => structuredClone(q));
  }

  async findAll(): Promise<readonly SecurityQuestion[]> {
    return this.rows.map((q) => structuredClone(q));
  }

  async exists(): Promise<boolean> {
    return this.rows.length > 0;
  }
}
