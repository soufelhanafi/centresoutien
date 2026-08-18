import type { EntityEnvelope } from './envelope';
import type { Role } from '../value-objects/role';
import type { UserId } from '../value-objects/ids';
import type { Email } from '../value-objects/email';

export type { UserId } from '../value-objects/ids';

// ULID id prefix for users: `usr_01HW…`. A User's id is the same UserId an
// envelope's `updatedBy` references — the acting user in the conflict UI is a row
// in this table — so the brand is shared, not redefined.
export const USER_ID_PREFIX = 'usr';

// How long a minted first-login setup code stays redeemable (7 days). Past this
// the code is expired and the director must mint a new one — a bounded window
// keeps an un-redeemed code from being a standing credential.
export const SETUP_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// A center-scoped login account (SOU-252). Replaces the single local
// `AdminAccount`: the director is `role: 'owner'`, employees are `role:
// 'secretary'` (other roles from Role exist but are unused in the MVP). One
// `users` table is the single credential store, resolved by `username` at login.
//
// SYNCED, sync-safe entity: carries the full envelope so accounts converge across
// a center's laptops (soft-delete only; a removed employee is a tombstone, never
// a hard delete). `passwordHash` and `setupCodeHash` are opaque Argon2id PHC
// strings produced by the PasswordHasher in the main process — the domain never
// inspects them and no plaintext (password or setup code) is ever stored.
//
// Uniqueness is EXACT, not fuzzy: `username` is unique per center among live rows
// (a partial unique index on the normalized form, like `Subject.code`). Users are
// created deliberately by the director, not matched-in from two devices, so they
// carry no people-like `naturalKey` — a same-username clash is a hard rejection,
// not a merge.
//
// A user is created in one of two shapes:
// - owner (first-run): `passwordHash` set immediately, no setup code.
// - employee (invited): `passwordHash` is `null` until the one-time setup code is
//   redeemed; `setupCodeHash` + `setupCodeExpiresAt` hold the pending invite, and
//   `setupCodeRedeemedAt` stamps the single redemption.
export type User = EntityEnvelope & {
  readonly id: UserId;
  role: Role;
  username: string;
  // Argon2id hash; `null` for an invited employee who has not redeemed their setup code yet.
  passwordHash: string | null;
  // Argon2id hash of the pending one-time setup code; `null` once redeemed or for an owner.
  setupCodeHash: string | null;
  // Epoch millis (UTC, from the Clock port) when the pending setup code expires;
  // `null` when no code is pending. Epoch millis (like DeviceSession.expiresAt) so
  // the domain never constructs a Date from a duration.
  setupCodeExpiresAt: number | null;
  // When the setup code was redeemed (UTC); `null` while still pending. Single-use marker.
  setupCodeRedeemedAt: Date | null;
  // Optional contact address, canonical (trim + lower-cased) via the Email VO;
  // `null` when the account has none (SOU-157). Set later through the account, never
  // required and never back-filled — its sole purpose is giving the future
  // password-reset-by-email relay somewhere to send to. A mutable people-field: a
  // change bumps updatedAt/updatedBy and is tracked in the per-field change log like
  // any other editable column. NOT a duplicate-matching key (accounts match on
  // username), so it is absent from the naturalKey and uniqueness index.
  email: Email | null;
};

// True when a user still has a redeemable setup code (pending and unexpired at `now`).
export function isSetupCodePending(user: User, now: Date): boolean {
  return (
    user.setupCodeHash !== null &&
    user.setupCodeRedeemedAt === null &&
    user.setupCodeExpiresAt !== null &&
    now.getTime() <= user.setupCodeExpiresAt
  );
}

// True when the user can attempt a password login — i.e. a password has been set.
export function canLogin(user: User): boolean {
  return user.passwordHash !== null;
}
