import { describe, it, expect, beforeEach } from 'vitest';
import { StoreCenterLogo } from '../../../src/use-cases/store-center-logo';
import { LOGO_MAX_BYTES } from '../../../src/schemas/center';
import { InMemoryLogoStore } from '../fakes/in-memory-logo-store';

describe('StoreCenterLogo', () => {
  let logos: InMemoryLogoStore;
  let useCase: StoreCenterLogo;

  beforeEach(() => {
    logos = new InMemoryLogoStore();
    useCase = new StoreCenterLogo(logos);
  });

  it('writes an accepted logo and returns its relative path', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const path = await useCase.execute({ bytes, extension: 'PNG' });

    expect(path).toBe('logos/lgo_0000.png'); // extension lower-cased by the schema
    expect(logos.writes).toHaveLength(1);
    expect(logos.writes[0]?.extension).toBe('png');
  });

  it('rejects an unsupported file type and writes nothing', async () => {
    await expect(useCase.execute({ bytes: new Uint8Array([1]), extension: 'gif' })).rejects.toThrow();
    expect(logos.writes).toHaveLength(0);
  });

  it('rejects a file over the size ceiling', async () => {
    const bytes = new Uint8Array(LOGO_MAX_BYTES + 1);
    await expect(useCase.execute({ bytes, extension: 'png' })).rejects.toThrow();
    expect(logos.writes).toHaveLength(0);
  });

  it('rejects an empty file', async () => {
    await expect(useCase.execute({ bytes: new Uint8Array(0), extension: 'png' })).rejects.toThrow();
  });
});
