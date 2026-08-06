import type { MergeLogEntry } from '../entities/merge-log';

/**
 * Persistence port for the merge audit trail (sync-safe-entities step 8).
 * **Append-only**: a merge log entry is written exactly once, when the merge
 * commits, and is never edited or deleted — undoing a merge is a NEW merge, not
 * a mutation of the record. The merge use cases hand their {@link MergeLogEntry}
 * to the merge unit-of-work port, which persists it inside the same atomic
 * transaction as the winner/loser/dependent writes; this standalone `record` is
 * the narrow seam for any future replay / undo / audit read that needs the same
 * append-only contract without coupling to the unit-of-work shape.
 */
export interface MergeLogRepository {
  /** Append one entry. Idempotency: re-recording an existing id must fail loudly. */
  record(entry: MergeLogEntry): Promise<void>;
}
