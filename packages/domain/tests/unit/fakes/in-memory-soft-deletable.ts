import type { SoftDeletableRepository } from '../../../src/repositories/soft-deletable';
import type { EntityEnvelope } from '../../../src/entities/envelope';

/**
 * In-memory implementation of the soft-delete port, shared by all entity fakes.
 * Mirrors the semantics the SQLite adapter (SOU-18) must uphold: reads exclude
 * tombstones, deletes are soft, saves defensively clone. Lives in tests/ — it
 * uses `structuredClone`, a host global that has no place in the pure domain.
 */
export abstract class InMemorySoftDeletableRepository<
  TId extends string,
  T extends { id: TId } & EntityEnvelope,
> implements SoftDeletableRepository<TId, T>
{
  protected readonly rows = new Map<TId, T>();

  async save(entity: T): Promise<void> {
    this.rows.set(entity.id, structuredClone(entity));
  }

  async findById(id: TId): Promise<T | null> {
    const row = this.rows.get(id);
    if (!row || row.deletedAt !== null) return null;
    return structuredClone(row);
  }

  async softDelete(id: TId, at: Date): Promise<void> {
    const row = this.rows.get(id);
    if (!row) return;
    row.deletedAt = at;
    row.updatedAt = at;
  }

  async listChangedSince(cursor: Date): Promise<readonly T[]> {
    return [...this.rows.values()]
      .filter((row) => row.updatedAt.getTime() > cursor.getTime())
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
      .map((row) => structuredClone(row));
  }

  /** test-only convenience */
  all(): readonly T[] {
    return [...this.rows.values()].map((row) => structuredClone(row));
  }
}
