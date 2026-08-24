/**
 * SOU-302 — DB-key recovery escrow.
 *
 * Seals (wraps) a center's SQLCipher DB key toward the product-wide X25519
 * recovery PUBLIC key using a libsodium anonymous sealed box (`crypto_box_seal`).
 * The sealed blob is anonymous and one-way: it can only be opened offline with
 * the owner-held recovery PRIVATE key, never by anything in the shipped binary.
 * This port therefore exposes ONLY a seal operation — unsealing lives solely in
 * the offline recovery CLI, which supplies the private key at run time.
 *
 * Scope is strictly per-center (center = tenant): one blob wraps exactly one
 * center's DB key, and a blob is never shared or mixed across centers.
 *
 * This is DB-key recovery, not a password reset — given the sealed blob and the
 * recovery private key, the CLI recovers the exact DB key and opens the
 * SQLCipher file.
 */
export interface RecoveryKeyEscrowPort {
  /**
   * Wrap `dbKey` toward `recoveryPublicKey` and return the sealed blob. Sealed
   * boxes embed an ephemeral sender key, so the result is non-deterministic:
   * two calls with identical inputs yield different blobs that both open back to
   * `dbKey`. The blob carries no identity and cannot be opened with the public
   * key alone — recovery requires the matching private key.
   */
  sealDbKey(dbKey: string, recoveryPublicKey: Uint8Array): Uint8Array;
}
