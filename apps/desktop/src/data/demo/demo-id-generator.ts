import type { IdGenerator } from '@centresoutien/domain';

/**
 * SOU-110 — a deterministic {@link IdGenerator} for the demo center.
 *
 * `hasIdPrefix` (the id shape check at every domain boundary) requires the
 * suffix to be a canonical 26-char Crockford base32 ULID, so this encodes a
 * monotonic counter into exactly that alphabet/shape — deterministic, valid
 * against the same regex the `ulid` package emits, and unique across prefixes.
 * Combined with the demo's fixed clock, seeding twice yields identical rows.
 */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID_LENGTH = 26;

export class DemoIdGenerator implements IdGenerator {
  private counter = 0n;

  next<T extends string = string>(prefix: string): T {
    let value = this.counter;
    this.counter += 1n;
    let suffix = '';
    for (let i = 0; i < ULID_LENGTH; i += 1) {
      suffix = CROCKFORD[Number(value % 32n)] + suffix;
      value /= 32n;
    }
    return `${prefix}_${suffix}` as T;
  }
}
