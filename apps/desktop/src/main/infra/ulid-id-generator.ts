import { ulid } from 'ulid';
import type { IdGenerator } from '@centresoutien/domain';

/**
 * Concrete IdGenerator: `{prefix}_{ULID}`. ULIDs are collision-free across
 * devices and sort lexicographically by creation time, which keeps sync cursors
 * cheap (CLAUDE.md §5).
 */
export class UlidIdGenerator implements IdGenerator {
  next<T extends string = string>(prefix: string): T {
    return `${prefix}_${ulid()}` as T;
  }
}
