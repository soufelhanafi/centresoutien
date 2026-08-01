import type { BackupPort } from '../ports/backup-port';
import type { BackupConfigStore } from '../ports/backup-config-store';
import type { Clock } from '../ports/clock';
import type { CenterCode } from '../value-objects/ids';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type RunScheduledBackupInput = {
  centerCode: CenterCode;
};

/**
 * Launch-time scheduled backup (SOU-102 KICKOFF: no OS-level cron — checked
 * once per app start; if more than 24h since the last run, run one). No-ops
 * silently when no destination is configured yet. Snapshots to the configured
 * folder, then prunes it down to the configured retention count — `list` is
 * newest-first, so everything past `retentionCount` is stale — before
 * recording the run. Errors propagate to the caller: a backup failure
 * (unmounted USB, full disk, permission denied…) must be visible for
 * diagnostics, but the caller (composition root) is responsible for never
 * letting it block app startup.
 */
export class RunScheduledBackup {
  constructor(
    private readonly backups: BackupPort,
    private readonly config: BackupConfigStore,
    private readonly clock: Clock,
  ) {}

  async execute(input: RunScheduledBackupInput): Promise<void> {
    const cfg = await this.config.get();
    if (cfg.destinationDir === null) return;
    if (cfg.lastBackupAt !== null) {
      const elapsedMs = this.clock.now().getTime() - cfg.lastBackupAt.getTime();
      if (elapsedMs < ONE_DAY_MS) return;
    }

    const destDir = cfg.destinationDir;
    await this.backups.create({ destDir, centerCode: input.centerCode });

    const files = await this.backups.list({ destDir, centerCode: input.centerCode });
    for (const stale of files.slice(cfg.retentionCount)) {
      await this.backups.remove(stale.path);
    }

    await this.config.recordBackupRun(this.clock.now());
  }
}
