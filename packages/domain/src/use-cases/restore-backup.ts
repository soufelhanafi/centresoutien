import type { BackupPort } from '../ports/backup-port';

export type RestoreBackupInput = {
  path: string;
  /** The center's derived SQLCipher key (SOU-179), injected by the IPC layer —
   *  backups verify/restore only on the machine that created them. */
  key: string;
};

export type RestoreBackupOutcome = 'restored' | 'not-found' | 'corrupted' | 'wrong-key';
export type RestoreBackupResult = { outcome: RestoreBackupOutcome };

/**
 * Restore flow (SOU-102 acceptance): integrity-checks the chosen backup file
 * and verifies it opens with the center's key BEFORE ever touching the live
 * database — a corrupted or wrong-key backup fails safely with a stable
 * outcome code and the current DB is never destroyed. Only once
 * {@link BackupPort.verify} reports `ok` does {@link BackupPort.restore} run
 * the actual swap (which itself keeps a `.pre-restore-*` safety copy of the
 * file it replaces). "Replace-with-confirmation" is a UI-level gate — the
 * renderer confirms with the admin before ever calling this use case, so a
 * single call here performs the full check-then-swap. On `'restored'` the
 * live connection has been closed as part of the swap; the caller (IPC layer)
 * must schedule an app restart so the encrypted connection reopens against the
 * restored file.
 */
export class RestoreBackup {
  constructor(private readonly backups: BackupPort) {}

  async execute(input: RestoreBackupInput): Promise<RestoreBackupResult> {
    const verification = await this.backups.verify(input.path, input.key);
    if (!verification.ok) return { outcome: verification.reason };

    await this.backups.restore(input.path);
    return { outcome: 'restored' };
  }
}
