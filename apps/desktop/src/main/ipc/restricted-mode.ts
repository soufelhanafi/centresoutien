import type { IpcChannel } from '../../shared/ipc/contract';

/**
 * The only IPC channels reachable while the license is non-active (restricted
 * mode, SOU-104). The restricted *decision* is the domain's (`isRestrictedMode`);
 * this allow-list is its transport projection — the two channels the activation
 * screen needs to read status and submit a license. Every other channel is hard-
 * locked at the dispatcher before its handler runs, so a renderer (or anything
 * speaking to the preload bridge) can never invoke e.g. `student.list` before a
 * license is activated. Enforcing it here supersedes the deferred SOU-173.
 */
export const RESTRICTED_MODE_ALLOWED_CHANNELS: ReadonlySet<IpcChannel> = new Set<IpcChannel>([
  'license.status',
  'license.activate',
]);
