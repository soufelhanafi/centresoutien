import sodium from 'libsodium-wrappers';
import type { RecoveryKeyEscrowPort } from '@centresoutien/domain';

/**
 * SOU-302 — libsodium adapter for {@link RecoveryKeyEscrowPort}.
 *
 * Wraps a center's SQLCipher DB key toward the product recovery public key with
 * an X25519 anonymous sealed box (`crypto_box_seal`). This is the ONLY place
 * libsodium is loaded on the escrow path; the adapter can seal but never unseal
 * — recovery happens exclusively in the offline CLI with the owner-held private
 * key. The WASM runtime must be ready before any crypto call, so the adapter is
 * built through the async {@link create} factory; `sealDbKey` is then synchronous
 * and matches the port contract exactly.
 */
export class LibsodiumRecoveryKeyEscrow implements RecoveryKeyEscrowPort {
  private constructor() {}

  static async create(): Promise<LibsodiumRecoveryKeyEscrow> {
    await sodium.ready;
    return new LibsodiumRecoveryKeyEscrow();
  }

  sealDbKey(dbKey: string, recoveryPublicKey: Uint8Array): Uint8Array {
    return sodium.crypto_box_seal(sodium.from_string(dbKey), recoveryPublicKey);
  }
}
