import type { RecoveryCode } from '../entities/recovery-code';

export interface RecoveryCodeRepository {
  saveMany(codes: readonly RecoveryCode[]): Promise<void>;
  findAllUnconsumed(): Promise<readonly RecoveryCode[]>;
  consumeById(id: RecoveryCode['id'], consumedAt: Date): Promise<void>;
  invalidateAll(now: Date): Promise<void>;
  countUnconsumed(): Promise<number>;
}
