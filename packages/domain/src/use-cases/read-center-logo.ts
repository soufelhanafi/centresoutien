import type { LogoStore } from '../ports/logo-store';

export type ReadCenterLogoInput = {
  /** The relative path stored on the center row (as {@link StoreCenterLogo} returned). */
  path: string;
};

/**
 * Reads back a stored center logo's bytes so the renderer can re-display it after
 * a reload. Pure delegation to the {@link LogoStore} port — the adapter guards
 * against path traversal and returns `null` for an unknown or stale reference, so
 * a missing logo is a normal (non-throwing) outcome. No plan gate — the logo is
 * part of the every-plan profile.
 */
export class ReadCenterLogo {
  constructor(private readonly logos: LogoStore) {}

  async execute(input: ReadCenterLogoInput): Promise<Uint8Array | null> {
    return this.logos.read(input.path);
  }
}
