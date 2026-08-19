import type { SessionInput } from './session-form-schema';
import type { SessionWriteGateway } from './session-write-gateway';

/**
 * The real {@link SessionWriteGateway}: maps the three write methods onto the
 * SOU-131 `weeklySession.*` IPC channels. No business logic — the
 * `CreateWeeklyRecurringSession` / `UpdateWeeklyRecurringSession` /
 * `CancelWeeklyRecurringSession` use cases behind the channels own the plan gate
 * and the SOU-55 composite conflict check. `centerCode` / `deviceOrigin` /
 * `updatedBy` are injected in main, never sent from the renderer, so the request
 * carries only the user-editable fields ({@link SessionInput}). Mirrors every
 * other IPC gateway (`IpcPlannerGateway`, `IpcHolidaysGateway`).
 *
 * The validity window and `active` are **defaults-only** for SOU-131 — the form
 * exposes no controls for them — but the channel's request type requires them, so
 * this adapter fills the domain defaults on the wire (`active: true`, unbounded
 * window). That keeps the form payload minimal while the contract stays explicit.
 *
 * `cancel` is a **soft delete** — the domain sets `deletedAt` and an
 * unknown/already-cancelled id raises `WeeklyRecurringSessionNotFoundError`
 * rather than silently succeeding, so the caller can surface it.
 */
// SOU-283: `input` may carry `allowScheduleConflict` when the admin forced a
// warning; the spread forwards it to the channel. The wire schema strips it until
// the domain branch adds it to `weeklyRecurringSessionInputSchema`.
// TODO(SOU-283): swap mock for real preload channel once domain merges — confirm
// `weeklySession.create`/`update` accept `allowScheduleConflict` end to end.
const WRITE_DEFAULTS = { active: true, validFrom: null, validTo: null } as const;

class IpcSessionWriteGateway implements SessionWriteGateway {
  async create(input: SessionInput): Promise<{ id: string }> {
    return window.api.invoke('weeklySession.create', { ...input, ...WRITE_DEFAULTS });
  }

  async update(id: string, input: SessionInput): Promise<{ id: string }> {
    return window.api.invoke('weeklySession.update', { ...input, ...WRITE_DEFAULTS, id });
  }

  async cancel(id: string): Promise<void> {
    await window.api.invoke('weeklySession.delete', { id });
  }
}

export const ipcSessionWriteGateway: SessionWriteGateway = new IpcSessionWriteGateway();
