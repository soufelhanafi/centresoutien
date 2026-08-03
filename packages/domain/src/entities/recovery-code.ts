import type { Brand } from '../value-objects/brand';

export const RECOVERY_CODE_ID_PREFIX = 'rec';

export type RecoveryCodeId = Brand<string, 'RecoveryCodeId'>;

/**
 * A single recovery code — stored only as an Argon2id hash, never plaintext.
 * Plaintext codes are returned ONCE at generation and are ephemeral in the
 * caller's memory; the domain never persists them. Local infra — like
 * AdminAccount, it carries no sync envelope and never travels to the hub.
 */
export type RecoveryCode = {
  readonly id: RecoveryCodeId;
  readonly codeHash: string;
  consumed: boolean;
  readonly createdAt: Date;
  consumedAt: Date | null;
};
