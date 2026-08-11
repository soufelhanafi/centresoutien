import type { SessionOccurrenceViewReadPort } from '../../../src/ports/session-occurrence-view-read-port';
import type { SessionOccurrenceView } from '../../../src/read-models/session-occurrence-view';
import type { SessionId } from '../../../src/entities/session';
import type { CenterCode } from '../../../src/value-objects/ids';

/**
 * In-memory {@link SessionOccurrenceViewReadPort} for use-case unit tests. The
 * port serves a denormalized read, so the fake holds pre-built enriched
 * {@link SessionOccurrenceView}s and returns the live ones ordered by date then
 * start — the join's correctness (neutral fallback for a null/archived relation)
 * is the SQLite adapter's concern, proven in its integration test. `softDelete`
 * models the port's tombstone-exclusion contract (`deleted_at IS NULL`) so a
 * cancelled occurrence drops out of subsequent reads, exactly like the adapter.
 */
export class InMemorySessionOccurrenceViewReadPort implements SessionOccurrenceViewReadPort {
  private readonly views: SessionOccurrenceView[] = [];
  private readonly tombstoned = new Set<SessionId>();

  /** Seed one enriched occurrence (test helper — not part of the port). */
  seed(view: SessionOccurrenceView): void {
    this.views.push(view);
  }

  /** Cancel an occurrence so it drops out of `listActiveOccurrenceViews` (test helper). */
  softDelete(id: SessionId): void {
    this.tombstoned.add(id);
  }

  async listActiveOccurrenceViews(
    centerCode: CenterCode,
  ): Promise<readonly SessionOccurrenceView[]> {
    void centerCode; // single-center fake: the view model carries no centerCode to filter on.
    return this.views
      .filter((view) => !this.tombstoned.has(view.id))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  }
}
