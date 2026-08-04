import type { SecurityQuestion } from '../entities/security-question';

/**
 * Persistence port for the security-questions set (SOU-155). Device-local
 * infra, like `RecoveryCodeRepository`: no soft-delete, no sync surface.
 * There is exactly one set of three for the single local admin account.
 */
export interface SecurityQuestionRepository {
  /**
   * Atomically replaces the whole set of three — setup and re-setup both
   * call this with a fresh set, never a partial update to one question.
   */
  saveAll(questions: readonly SecurityQuestion[]): Promise<void>;
  /** The current set (empty array if never configured). */
  findAll(): Promise<readonly SecurityQuestion[]>;
  /** True once the three questions have been set (drives the settings screen). */
  exists(): Promise<boolean>;
}
