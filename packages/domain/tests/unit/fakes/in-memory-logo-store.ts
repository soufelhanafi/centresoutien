import type { LogoStore } from '../../../src/ports/logo-store';

/**
 * In-memory {@link LogoStore} for unit tests. Records each write and returns a
 * deterministic relative path so use-case assertions stay stable without a
 * filesystem.
 */
export class InMemoryLogoStore implements LogoStore {
  readonly writes: { bytes: Uint8Array; extension: string }[] = [];
  private readonly files = new Map<string, Uint8Array>();
  private seq = 0;

  async save(input: { bytes: Uint8Array; extension: string }): Promise<string> {
    this.writes.push({ bytes: input.bytes, extension: input.extension });
    const path = `logos/lgo_${String(this.seq++).padStart(4, '0')}.${input.extension}`;
    this.files.set(path, input.bytes);
    return path;
  }

  async read(relativePath: string): Promise<Uint8Array | null> {
    return this.files.get(relativePath) ?? null;
  }
}
