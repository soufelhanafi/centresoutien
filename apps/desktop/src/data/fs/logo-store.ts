import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import type { LogoStore, IdGenerator } from '@centresoutien/domain';

/** Sub-directory under app data where logos are written. */
export const LOGO_DIR = 'logos';

/**
 * Filesystem adapter for {@link LogoStore}. Writes the logo under
 * `<baseDir>/logos/` with a fresh ULID filename and returns the **relative**
 * reference (`logos/lgo_….png`, forward-slashed) to persist on the center row —
 * so it stays portable across machines and app-data locations. Extension and
 * size are already validated by the domain use case; this adapter only writes
 * and reads back its own files.
 */
export class FsLogoStore implements LogoStore {
  constructor(
    private readonly baseDir: string,
    private readonly ids: IdGenerator,
  ) {}

  async save({ bytes, extension }: { bytes: Uint8Array; extension: string }): Promise<string> {
    const fileName = `${this.ids.next('lgo')}.${extension}`;
    const dir = join(this.baseDir, LOGO_DIR);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, fileName), bytes);
    return `${LOGO_DIR}/${fileName}`;
  }

  async read(relativePath: string): Promise<Uint8Array | null> {
    const absolute = this.resolveInsideLogoDir(relativePath);
    if (absolute === null) return null;
    try {
      return new Uint8Array(readFileSync(absolute));
    } catch {
      // Missing or unreadable file — a stale reference reads as "no logo".
      return null;
    }
  }

  /**
   * Resolve `relativePath` to an absolute path **only if** it stays inside
   * `<baseDir>/logos/`. Returns `null` on any traversal attempt (`..`, absolute
   * paths, paths outside the logo dir) so `read` can never leak arbitrary files.
   */
  private resolveInsideLogoDir(relativePath: string): string | null {
    if (relativePath === '' || isAbsolute(relativePath)) return null;
    const logoRoot = resolve(this.baseDir, LOGO_DIR);
    const candidate = resolve(logoRoot, relativePath.replace(/^logos[\\/]/, ''));
    const rel = relative(logoRoot, candidate);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null;
    return candidate;
  }
}
