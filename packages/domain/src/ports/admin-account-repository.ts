import type { AdminAccount, AdminAccountId } from '../entities/admin-account';

/**
 * Persistence port for the local admin account. Deliberately narrow (ISP): the
 * account is device-local infra, not a synced entity, so there is no soft-delete
 * or sync-cursor surface. `exists` answers first-run detection; `findByUsername`
 * backs login.
 *
 * Owner credential writes are the one admin path that MAY replicate (SOU-258):
 * {@link save} takes a `replicate` flag the DOMAIN decides (via
 * {@link participatesInSync}) — the adapter never guesses. A sync-participating
 * owner (created through the logging user repository, or arrived via sync) has
 * its rotated hash pushed to paired devices; a MIGRATED owner — backfilled by
 * migration 0044 with a device-local ULID and no sync presence — stays
 * device-local on purpose, because pushing it would collide on
 * `ux_users_username_live`. Persisting both atomically is the adapter's job; the
 * policy is the caller's.
 */
export interface AdminAccountRepository {
  /** True when any admin account is present (drives first-run detection). */
  exists(): Promise<boolean>;
  /**
   * Case-insensitive lookup (SOU-153): implementations must match `username`
   * against the stored account after {@link normalizeUsername}, not by exact
   * string equality, so login succeeds regardless of casing typed.
   */
  findByUsername(username: string): Promise<AdminAccount | null>;
  /**
   * The sole admin account (single-admin app). Backs password change, which has
   * no username to look up by — the settings screen never asks for one.
   */
  findOnly(): Promise<AdminAccount | null>;
  /**
   * True when the owner row already participates in the sync feed — created via
   * the logging user repository (a `users` change_log row), or pulled from the
   * hub into `sync_local_entity`. Migrated (backfilled) owners have neither.
   * Feeds the {@link save} `replicate` decision; never used to gate a write.
   */
  participatesInSync(id: AdminAccountId): Promise<boolean>;
  /**
   * Insert on first creation, or update the hash/username on a later change.
   * `replicate` is the DOMAIN's decision about whether the write should append
   * to `change_log`; an adapter persists the row and (when `replicate`) the log
   * entry in ONE transaction — it never re-derives the policy.
   */
  save(account: AdminAccount, options?: { readonly replicate: boolean }): Promise<void>;
}
