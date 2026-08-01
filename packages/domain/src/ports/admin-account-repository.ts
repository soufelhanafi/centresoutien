import type { AdminAccount } from '../entities/admin-account';

/**
 * Persistence port for the local admin account. Deliberately narrow (ISP): the
 * account is device-local infra, not a synced entity, so there is no soft-delete
 * or sync-cursor surface. `exists` answers first-run detection; `findByUsername`
 * backs login.
 */
export interface AdminAccountRepository {
  /** True when any admin account is present (drives first-run detection). */
  exists(): Promise<boolean>;
  findByUsername(username: string): Promise<AdminAccount | null>;
  /**
   * The sole admin account (single-admin app). Backs password change, which has
   * no username to look up by — the settings screen never asks for one.
   */
  findOnly(): Promise<AdminAccount | null>;
  /** Insert on first creation, or update the hash/username on a later change. */
  save(account: AdminAccount): Promise<void>;
}
