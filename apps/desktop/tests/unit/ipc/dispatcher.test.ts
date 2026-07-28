import { describe, expect, it } from 'vitest';
import { createIpcDispatcher } from '../../../src/main/ipc/dispatcher';
import { createHandlers } from '../../../src/main/ipc/handlers';
import type { IpcHandlers } from '../../../src/shared/ipc/contract';

const dispatch = createIpcDispatcher(createHandlers({ appVersion: () => '2.0.0' }));

describe('createIpcDispatcher', () => {
  it('validates the request, runs the handler, and validates the response', async () => {
    await expect(dispatch('app.ping', { message: 'hi' })).resolves.toEqual({
      reply: 'pong: hi',
      appVersion: '2.0.0',
    });
  });

  it('rejects a request that fails its schema', async () => {
    await expect(dispatch('app.ping', { message: 123 })).rejects.toThrow();
    await expect(dispatch('app.ping', {})).rejects.toThrow();
  });

  it('rejects an unknown channel', async () => {
    // @ts-expect-error — deliberately off-contract to prove the runtime guard
    await expect(dispatch('nope.channel', {})).rejects.toThrow(/unknown ipc channel/i);
  });

  it('rejects when a handler returns an off-contract response', async () => {
    const bad: IpcHandlers = {
      // missing appVersion — must fail response validation
      'app.ping': () => ({ reply: 'x' }) as never,
    };
    const badDispatch = createIpcDispatcher(bad);
    await expect(badDispatch('app.ping', { message: 'hi' })).rejects.toThrow();
  });
});
