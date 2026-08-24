import { writeFileSync, renameSync, unlinkSync } from 'node:fs';
import type { RecoveryKeyEscrowPort } from '@centresoutien/domain';

/** Extension of the sibling blob written next to an encrypted `.db` file. */
export const RECOVERY_BLOB_SUFFIX = '.recovery';

/**
 * Path of the sealed recovery blob that travels beside `dbFilePath`, e.g.
 * `centre-<id>.db` → `centre-<id>.recovery` and
 * `backup-<code>_<ULID>.db` → `backup-<code>_<ULID>.recovery`.
 */
export function recoveryBlobPathFor(dbFilePath: string): string {
  const withoutDbSuffix = dbFilePath.endsWith('.db') ? dbFilePath.slice(0, -'.db'.length) : dbFilePath;
  return `${withoutDbSuffix}${RECOVERY_BLOB_SUFFIX}`;
}

/**
 * SOU-302 — persists the sealed DB-key blob as a sibling file next to a center's
 * encrypted database (and next to each backup, so it travels with the copy). The
 * blob is per-center: it wraps exactly this center's DB key toward the product
 * recovery public key. Sealing is delegated to {@link RecoveryKeyEscrowPort}; the
 * write is atomic (temp file + rename) with 0o600 perms, since the blob relates
 * to key material even though it is useless without the offline private key.
 */
export class RecoveryKeyEscrowWriter {
  constructor(
    private readonly escrow: RecoveryKeyEscrowPort,
    private readonly recoveryPublicKey: Uint8Array,
  ) {}

  writeSiblingFor(dbFilePath: string, dbKey: string): void {
    const sealed = this.escrow.sealDbKey(dbKey, this.recoveryPublicKey);
    const target = recoveryBlobPathFor(dbFilePath);
    const temp = `${target}.tmp`;
    try {
      writeFileSync(temp, sealed, { mode: 0o600 });
      renameSync(temp, target);
    } catch (error) {
      try {
        unlinkSync(temp);
      } catch {
        // Best-effort cleanup of the temp file; surface the original failure.
      }
      throw error;
    }
  }
}
