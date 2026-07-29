import type { LogoStore } from '../ports/logo-store';
import { logoUploadSchema } from '../schemas/center';

export type StoreCenterLogoInput = {
  bytes: Uint8Array;
  /** File extension without the dot, e.g. `png` — case-insensitive. */
  extension: string;
};

/**
 * Validates a logo upload (accepted type + size ceiling) and delegates the byte
 * write to the {@link LogoStore} port, returning the relative path to persist on
 * the center row. No plan gate — a logo is part of the every-plan profile. Kept
 * separate from {@link SaveCenterProfile} so file storage and the entity write
 * stay decoupled: the renderer uploads, receives the path, then saves it with
 * the rest of the form.
 */
export class StoreCenterLogo {
  constructor(private readonly logos: LogoStore) {}

  async execute(input: StoreCenterLogoInput): Promise<string> {
    const { extension } = logoUploadSchema.parse({
      extension: input.extension,
      byteLength: input.bytes.byteLength,
    });
    return this.logos.save({ bytes: input.bytes, extension });
  }
}
