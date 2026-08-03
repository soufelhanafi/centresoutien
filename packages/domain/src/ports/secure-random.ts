/**
 * Cryptographically secure random bytes. The domain declares the need; the
 * concrete adapter (Node `crypto.randomBytes`) lives in the main process so
 * no platform-specific API leaks into the domain.
 */
export interface SecureRandom {
  /** Returns `count` random bytes as a Buffer. */
  bytes(count: number): Uint8Array;
  /** Returns `count` random bytes as an uppercase hex string. */
  hex(count: number): string;
}
