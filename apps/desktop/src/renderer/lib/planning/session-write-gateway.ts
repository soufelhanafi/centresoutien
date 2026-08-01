import type { SessionInput } from './session-form-schema';
import { mockSessionWriteGateway } from './mock-session-write-gateway';

/**
 * The seam the session create/edit UI depends on (Dependency Inversion). Hooks
 * call this interface, never `window.api` directly, so the concrete adapter is
 * swappable in one place with no change to any component.
 *
 * ## Contract status (SOU-131 frontend ↔ backend)
 *
 * The backend published the three channels, but on the `feature/SOU-131-domain`
 * branch not yet integrated into this worktree, so `window.api.invoke` cannot be
 * typed against them here. This ships against {@link mockSessionWriteGateway}; at
 * integration add `ipc-session-write-gateway.ts` mapping onto the real channels
 * and swap the one line at the bottom. No component changes. The channels:
 *
 * - `create` → `weeklySession.create`  (req `WeeklyRecurringSessionInput`, res `{ id }`)
 * - `update` → `weeklySession.update`  (req input `& { id }`, res `{ id }`)
 * - `cancel` → `weeklySession.delete`  (req `{ id }`, res `{ ok: true }`)
 *
 * `cancel` is a **soft delete** (sets `deletedAt`), never a hard delete — the row
 * still syncs as a tombstone (CLAUDE.md §5) and an unknown/already-cancelled id
 * raises `WeeklyRecurringSessionNotFoundError` (it does not silently succeed).
 * `create`/`update` throw the scheduling errors mapped by {@link mapSessionWriteError};
 * the flow wrappers surface those inline and toast anything else.
 */
export interface SessionWriteGateway {
  create(input: SessionInput): Promise<{ id: string }>;
  update(id: string, input: SessionInput): Promise<{ id: string }>;
  cancel(id: string): Promise<void>;
}

/** The active gateway. Mock today; swap for the IPC adapter when the contract lands. */
export const sessionWriteGateway: SessionWriteGateway = mockSessionWriteGateway;
