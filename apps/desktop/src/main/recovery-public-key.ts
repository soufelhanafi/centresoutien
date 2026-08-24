import { Buffer } from 'node:buffer';

/**
 * SOU-302 — product-wide recovery PUBLIC key (X25519).
 *
 * DB keys are sealed toward this key so that, if a center's machine or OS
 * keychain dies, the owner can recover the DB key offline. Only the PUBLIC half
 * is baked into the binary: the shipped app can seal (wrap) but can never unseal.
 * The matching PRIVATE key is owner-held, kept offline, and is NEVER present in
 * source, the build, or any shipped file — the offline recovery CLI reads it from
 * an operator-supplied argument/file at run time.
 *
 * Generated once with libsodium `crypto_box_keypair()` (X25519); the public key
 * is stored here as base64, the private key was written only to the untracked,
 * gitignored `RECOVERY_PRIVATE_KEY.txt` at the repo root and never committed.
 */
const RECOVERY_PUBLIC_KEY_BASE64 = 'JguIyuU4qDaBtWm3i9bdDVmy80DRInSPqWFmUeECDy4=';

export function recoveryPublicKey(): Uint8Array {
  return new Uint8Array(Buffer.from(RECOVERY_PUBLIC_KEY_BASE64, 'base64'));
}
