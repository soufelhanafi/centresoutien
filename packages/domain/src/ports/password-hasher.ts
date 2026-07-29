/**
 * Password hashing port. The domain declares the need; the concrete Argon2id
 * adapter lives in the main process (`apps/desktop/src/main/infra`) so the hash
 * never leaves main (SOU-26). Both operations are async — real hashing is
 * deliberately slow.
 */
export interface PasswordHasher {
  /** Hash a plaintext password, returning an opaque encoded hash string. */
  hash(plain: string): Promise<string>;
  /** Verify a plaintext password against a previously produced hash. */
  verify(hash: string, plain: string): Promise<boolean>;
}
