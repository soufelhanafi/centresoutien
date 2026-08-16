import type { IpcResponse } from '../../../shared/ipc/contract';

/**
 * Presentation projection of a user account as it crosses the IPC boundary
 * (SOU-256) — credential material (password hash, setup-code hash, the one-time
 * code) is stripped in main; the renderer only ever sees these safe fields. A
 * direct alias of the `user.list` channel's row so the team list can never drift
 * from what the channel returns, mirroring `SubjectView = SubjectDto`.
 */
export type UserView = IpcResponse<'user.list'>['users'][number];
