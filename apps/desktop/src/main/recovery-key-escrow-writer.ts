import { writeFileSync, renameSync, unlinkSync } from 'node:fs';
import type { RecoveryKeyEscrowPort } from '@centresoutien/domain';
import { recoveryBlobPathFor } from '../data/sqlite/recovery-blob-path';

// Re-exported so existing importers (composition root, tests) keep a single
// import site while the `.db` → `.recovery` mapping lives in the data layer,
// where backup pruning and center discard also derive it.
export { RECOVERY_BLOB_SUFFIX, recoveryBlobPathFor } from '../data/sqlite/recovery-blob-path';

/**
 * SOU-302 — persists the sealed DB-key blob as a sibling file next to a center's
 * encrypted database (and next to each backup, so it travels with the copy). The
 * blob is per-center: it wraps exactly this center's DB key toward the product
 * recovery public key. Sealing is delegated to {@link RecoveryKeyEscrowPort}; the
 * write is atomic (temp file + rename) with 0o600 perms, since the blob relates
 * to key material even though it is useless without the offline private key.
 *
 * Fields are declared and assigned explicitly (no TS parameter-property
 * shorthand) so the offline rekey CLI can import this module under Node's
 * strip-only type-stripping, which rejects parameter properties.
 */
export class RecoveryKeyEscrowWriter {
  private readonly escrow: RecoveryKeyEscrowPort;
  private readonly recoveryPublicKey: Uint8Array;

  constructor(escrow: RecoveryKeyEscrowPort, recoveryPublicKey: Uint8Array) {
    this.escrow = escrow;
    this.recoveryPublicKey = recoveryPublicKey;
  }

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
