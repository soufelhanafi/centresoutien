/**
 * Generates globally-unique, prefixed ULIDs (e.g. `next('stu')` → 'stu_01HW…').
 * Injected so tests are deterministic; the concrete ULID-backed generator lives
 * outside the domain.
 *
 * Generic so a caller can type the result from the prefix without an assertion:
 * `next<MergeLogId>(MERGE_LOG_ID_PREFIX)`. The default `string` keeps existing
 * un-parameterized calls and their branded `as X` casts valid.
 */
export interface IdGenerator {
  next<T extends string = string>(prefix: string): T;
}
