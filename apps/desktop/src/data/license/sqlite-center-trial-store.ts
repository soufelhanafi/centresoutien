import type { Database as DB } from 'better-sqlite3';
import type { CenterTrial, CenterTrialStore } from '@centresoutien/domain';

type CenterTrialRow = {
  started_at: string;
  last_seen_at: string;
};

/**
 * Device-local trial persistence for one center database. It deliberately has
 * no sync envelope: a trial is a personal-sale access window, not center data.
 */
export class SqliteCenterTrialStore implements CenterTrialStore {
  constructor(private readonly db: DB) {}

  get(): CenterTrial | null {
    const row = this.db.prepare('SELECT started_at, last_seen_at FROM center_trial WHERE singleton = 1').get() as
      | CenterTrialRow
      | undefined;
    if (row === undefined) return null;

    const startedAt = new Date(row.started_at);
    const lastSeenAt = new Date(row.last_seen_at);
    if (Number.isNaN(startedAt.getTime()) || Number.isNaN(lastSeenAt.getTime())) return null;
    return { startedAt, lastSeenAt };
  }

  save(trial: CenterTrial): void {
    this.db
      .prepare(
        `INSERT INTO center_trial (singleton, started_at, last_seen_at)
         VALUES (1, ?, ?)
         ON CONFLICT(singleton) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
      )
      .run(trial.startedAt.toISOString(), trial.lastSeenAt.toISOString());
  }
}
