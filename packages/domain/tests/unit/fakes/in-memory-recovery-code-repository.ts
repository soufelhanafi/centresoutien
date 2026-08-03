import type { RecoveryCodeRepository } from '../../../src/ports/recovery-code-repository';
import type { RecoveryCode } from '../../../src/entities/recovery-code';

export class InMemoryRecoveryCodeRepository implements RecoveryCodeRepository {
  private rows: RecoveryCode[] = [];

  async saveMany(codes: readonly RecoveryCode[]): Promise<void> {
    this.rows.push(...codes.map((c) => structuredClone(c)));
  }

  async findAllUnconsumed(): Promise<readonly RecoveryCode[]> {
    return this.rows.filter((c) => !c.consumed).map((c) => structuredClone(c));
  }

  async consumeById(id: RecoveryCode['id']): Promise<void> {
    const idx = this.rows.findIndex((c) => c.id === id);
    if (idx !== -1) {
      this.rows[idx] = { ...this.rows[idx], consumed: true, consumedAt: new Date() };
    }
  }

  async invalidateAll(): Promise<void> {
    this.rows = this.rows.map((c) =>
      c.consumed ? c : { ...c, consumed: true, consumedAt: new Date() },
    );
  }

  async countUnconsumed(): Promise<number> {
    return this.rows.filter((c) => !c.consumed).length;
  }

  all(): readonly RecoveryCode[] {
    return this.rows;
  }
}
