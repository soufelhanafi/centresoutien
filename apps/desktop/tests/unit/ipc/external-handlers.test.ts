import { beforeEach, describe, expect, it, vi } from 'vitest';

const openExternal = vi.fn<(url: string) => Promise<void>>(() => Promise.resolve());
vi.mock('electron', () => ({ shell: { openExternal: (url: string) => openExternal(url) } }));

const { createExternalHandlers } = await import('../../../src/main/ipc/external-handlers');

describe('external.open handler', () => {
  beforeEach(() => openExternal.mockClear());

  it('opens a whitelisted url and reports opened', async () => {
    const handlers = createExternalHandlers();
    const result = await handlers['external.open']({ url: 'https://centresoutien.com/tarifs' });
    expect(result).toEqual({ opened: true });
    expect(openExternal).toHaveBeenCalledWith('https://centresoutien.com/tarifs');
  });

  it('refuses a non-whitelisted url without touching the shell', async () => {
    const handlers = createExternalHandlers();
    const result = await handlers['external.open']({ url: 'https://evil.com' });
    expect(result).toEqual({ opened: false });
    expect(openExternal).not.toHaveBeenCalled();
  });
});
