import type { WeeklySessionViewReadPort } from '../../../src/ports/weekly-session-view-read-port';
import type { WeeklySessionView } from '../../../src/read-models/weekly-session-view';
import type { CenterCode } from '../../../src/value-objects/ids';

/**
 * In-memory {@link WeeklySessionViewReadPort} for use-case unit tests. The port
 * serves a denormalized read, so the fake simply holds pre-built
 * {@link WeeklySessionView}s per center and returns them in insertion order — the
 * join's correctness (ordering, neutral fallback for a null/archived group) is the
 * SQLite adapter's concern, proven in its integration test, not here. `ListWeekSessions`
 * only proves it gates the plan and passes the read through untouched.
 */
export class InMemoryWeeklySessionViewReadPort implements WeeklySessionViewReadPort {
  private readonly byCenter = new Map<string, WeeklySessionView[]>();

  /** Seed one center's week (test helper — not part of the port). */
  seed(centerCode: CenterCode, views: readonly WeeklySessionView[]): void {
    this.byCenter.set(centerCode, [...views]);
  }

  async listWeekView(centerCode: CenterCode): Promise<readonly WeeklySessionView[]> {
    return this.byCenter.get(centerCode) ?? [];
  }
}
