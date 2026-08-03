import type { RecoveryCode } from '../entities/recovery-code';

/**
 * Persistence port for recovery codes (SOU-154). Local infra only — no sync
 * envelope. Codes are ALWAYS stored as hashes; the plaintext is ephemeral and
 * returned ONCE by the generator, not persisted. The repo stays pure data
 * access; hash verification happens in the use case.
 */
export interface RecoveryCodeRepository {
  saveMany(codes: readonly RecoveryCode[]): Promise<void>;
  findAllUnconsumed(): Promise<readonly RecoveryCode[]>;
  consumeById(id: RecoveryCode['id']): Promise<void>;
  invalidateAll(): Promise<void>;
  countUnconsumed(): Promise<number>;
}
