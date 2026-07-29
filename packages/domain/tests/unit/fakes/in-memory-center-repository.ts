import type { CenterRepository } from '../../../src/ports/center-repository';
import type { Center } from '../../../src/entities/center';

/**
 * In-memory {@link CenterRepository} for unit tests. Holds a single row, like
 * the SQLite adapter (one center per DB file). Defensive clones so callers can't
 * mutate stored state, mirroring the adapter's serialize/deserialize boundary.
 */
export class InMemoryCenterRepository implements CenterRepository {
  private row: Center | null = null;

  async get(): Promise<Center | null> {
    return this.row ? structuredClone(this.row) : null;
  }

  async save(center: Center): Promise<void> {
    this.row = structuredClone(center);
  }

  async listChangedSince(cursor: Date): Promise<readonly Center[]> {
    if (this.row && this.row.updatedAt.getTime() > cursor.getTime()) {
      return [structuredClone(this.row)];
    }
    return [];
  }
}
