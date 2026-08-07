import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MachineIdentity } from '@centresoutien/domain';

/** File under the app-data directory that holds the stable machine id. */
export const MACHINE_ID_FILE = 'machine-id';

/**
 * A stable, machine-scoped {@link MachineIdentity} backed by a plain file in the
 * app-data directory. The file is shared by every center on the laptop (it lives
 * beside the per-center DB files, not inside one), so the same machine returns the
 * same id whichever center is open — a license bound to a machine matches across
 * that owner's centers.
 *
 * Generated once (a random UUID) on first read and cached in memory. This is
 * honest-user enforcement only (CLAUDE.md §5quater), never a secret — a user who
 * edits the file just changes which licenses their own machine accepts.
 */
export class FileMachineIdentity implements MachineIdentity {
  private cached: string | null = null;

  constructor(private readonly baseDir: string) {}

  machineId(): string {
    if (this.cached !== null) return this.cached;
    this.cached = this.readOrCreate();
    return this.cached;
  }

  private readOrCreate(): string {
    const path = join(this.baseDir, MACHINE_ID_FILE);
    const existing = this.read(path);
    if (existing !== null) return existing;

    const id = randomUUID();
    mkdirSync(this.baseDir, { recursive: true });
    writeFileSync(path, id, 'utf8');
    return id;
  }

  private read(path: string): string | null {
    try {
      const value = readFileSync(path, 'utf8').trim();
      return value.length > 0 ? value : null;
    } catch {
      return null;
    }
  }
}
