import { describe, it, expect, beforeEach } from 'vitest';
import { ReadCenterLogo } from '../../../src/use-cases/read-center-logo';
import { InMemoryLogoStore } from '../fakes/in-memory-logo-store';

describe('ReadCenterLogo', () => {
  let logos: InMemoryLogoStore;
  let useCase: ReadCenterLogo;

  beforeEach(() => {
    logos = new InMemoryLogoStore();
    useCase = new ReadCenterLogo(logos);
  });

  it('returns the stored bytes for a known path', async () => {
    const bytes = new Uint8Array([4, 5, 6]);
    const path = await logos.save({ bytes, extension: 'png' });

    expect(await useCase.execute({ path })).toEqual(bytes);
  });

  it('returns null for an unknown path (missing/stale reference)', async () => {
    expect(await useCase.execute({ path: 'logos/nope.png' })).toBeNull();
  });
});
