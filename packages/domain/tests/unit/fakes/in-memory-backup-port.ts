import type { BackupPort, BackupFileInfo, BackupVerification } from '../../../src/ports/backup-port';
import type { CenterCode } from '../../../src/value-objects/ids';

/**
 * In-memory {@link BackupPort} fake. `seedVerification` lets tests control what
 * `verify()` reports for a given path without touching real SQLCipher files;
 * `restore()` records the path it was called with instead of touching a real DB.
 */
export class InMemoryBackupPort implements BackupPort {
  private files = new Map<string, BackupFileInfo & { centerCode: CenterCode }>();
  private verifications = new Map<string, BackupVerification>();
  private nextSuffix = 1;
  restoredPaths: string[] = [];
  removedPaths: string[] = [];

  async create({ destDir, centerCode }: { destDir: string; centerCode: CenterCode }): Promise<BackupFileInfo> {
    const fileName = `backup-${centerCode}_${String(this.nextSuffix).padStart(4, '0')}.db`;
    // Deterministic, strictly-increasing timestamps — never real wall-clock time
    // in a fake (unit-testing skill: no `new Date()` bleeding into test data).
    const createdAt = new Date(2026, 0, 1, 0, 0, this.nextSuffix);
    this.nextSuffix += 1;
    const file: BackupFileInfo & { centerCode: CenterCode } = {
      fileName,
      path: `${destDir}/${fileName}`,
      sizeBytes: 1024,
      createdAt,
      centerCode,
    };
    this.files.set(file.path, file);
    return file;
  }

  async list({ destDir, centerCode }: { destDir: string; centerCode: CenterCode }): Promise<BackupFileInfo[]> {
    return [...this.files.values()]
      .filter((f) => f.path.startsWith(`${destDir}/`) && f.centerCode === centerCode)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(({ fileName, path, sizeBytes, createdAt }) => ({ fileName, path, sizeBytes, createdAt }));
  }

  async remove(path: string): Promise<void> {
    this.removedPaths.push(path);
    this.files.delete(path);
  }

  async verify(path: string): Promise<BackupVerification> {
    return this.verifications.get(path) ?? { ok: false, reason: 'not-found' };
  }

  async restore(path: string): Promise<void> {
    this.restoredPaths.push(path);
  }

  // test-only helpers
  seedVerification(path: string, result: BackupVerification): void {
    this.verifications.set(path, result);
  }

  all(): BackupFileInfo[] {
    return [...this.files.values()];
  }
}
