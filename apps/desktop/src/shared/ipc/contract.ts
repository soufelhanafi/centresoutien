import { z } from 'zod';

/**
 * The typed IPC contract (SOU-15). Every renderer↔main call is a named channel
 * with a zod request AND response schema, validated on both ends. Adding a
 * method = one entry here; main provides the handler, the preload bridge and
 * renderer get their types for free.
 */
export const ipcContract = {
  'app.ping': {
    request: z.object({ message: z.string() }),
    response: z.object({ reply: z.string(), appVersion: z.string() }),
  },
} as const;

export type IpcContract = typeof ipcContract;
export type IpcChannel = keyof IpcContract;
export type IpcRequest<C extends IpcChannel> = z.infer<IpcContract[C]['request']>;
export type IpcResponse<C extends IpcChannel> = z.infer<IpcContract[C]['response']>;

export type IpcHandlers = {
  [C in IpcChannel]: (request: IpcRequest<C>) => IpcResponse<C> | Promise<IpcResponse<C>>;
};

export function isIpcChannel(value: string): value is IpcChannel {
  return Object.prototype.hasOwnProperty.call(ipcContract, value);
}
