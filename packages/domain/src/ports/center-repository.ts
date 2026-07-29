import type { Center } from '../entities/center';

/**
 * Persistence port for the single center row. Not a `SoftDeletableRepository`:
 * a center is never deleted from within its own database, and it has no
 * `findById` (there is exactly one). `listChangedSince` still exists so the
 * profile syncs across the center's laptops like any other entity.
 */
export interface CenterRepository {
  /** The center row, or null before the profile has ever been saved. */
  get(): Promise<Center | null>;
  save(center: Center): Promise<void>;
  /** Sync cursor query: the row if updated strictly after `cursor`, else empty. */
  listChangedSince(cursor: Date): Promise<readonly Center[]>;
}
