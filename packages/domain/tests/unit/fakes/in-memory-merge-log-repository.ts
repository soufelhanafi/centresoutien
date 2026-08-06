import type { MergeLogRepository } from '../../../src/ports/merge-log-repository';
import type { MergeLogEntry, MergeLogId } from '../../../src/entities/merge-log';

/**
 * In-memory {@link MergeLogRepository} for unit tests. Mirrors the SQLite
 * adapter's append-only semantics: `record` is the only writer and re-recording
 * an existing id fails loudly (like a plain INSERT); there is no update/delete
 * path at all — the port doesn't expose one.
 */
export class InMemoryMergeLogRepository implements MergeLogRepository {
  private readonly rows = new Map<MergeLogId, MergeLogEntry>();

  async record(entry: MergeLogEntry): Promise<void> {
    if (this.rows.has(entry.id)) {
      throw new Error(`merge log ${entry.id} already exists (append-only)`);
    }
    this.rows.set(entry.id, structuredClone(entry));
  }

  /** test-only convenience */
  all(): readonly MergeLogEntry[] {
    return [...this.rows.values()].map((row) => structuredClone(row));
  }

  /** test-only convenience — used by the merge unit-of-work fakes to restore a snapshot. */
  clear(): void {
    this.rows.clear();
  }
}
