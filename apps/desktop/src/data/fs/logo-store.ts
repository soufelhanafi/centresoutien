import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LogoStore, IdGenerator } from '@centresoutien/domain';

/** Sub-directory under app data where logos are written. */
export const LOGO_DIR = 'logos';

/**
 * Filesystem adapter for {@link LogoStore}. Writes the logo under
 * `<baseDir>/logos/` with a fresh ULID filename and returns the **relative**
 * reference (`logos/lgo_….png`, forward-slashed) to persist on the center row —
 * so it stays portable across machines and app-data locations. Extension and
 * size are already validated by the domain use case; this adapter only writes.
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
}
