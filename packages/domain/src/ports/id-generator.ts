/**
 * Generates globally-unique, prefixed ULIDs (e.g. `next('stu')` → 'stu_01HW…').
 * Injected so tests are deterministic; the concrete ULID-backed generator lives
 * outside the domain.
 */
export interface IdGenerator {
  next(prefix: string): string;
}
