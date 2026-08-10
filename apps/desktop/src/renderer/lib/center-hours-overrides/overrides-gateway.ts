import type { CenterHoursOverrideInput, CenterHoursOverrideView } from './override-view';
import { ipcCenterHoursOverridesGateway } from './ipc-overrides-gateway';

/**
 * The seam the dated-override UI depends on (Dependency Inversion). Hooks call
 * this interface, never `window.api` directly, so swapping the concrete adapter
 * is a one-line change with no component edits.
 *
 * ## Contract status (SOU-165 frontend ↔ domain)
 *
 * All four channels are published with their SQLite-backed IPC handlers, so this
 * ships against the real {@link ipcCenterHoursOverridesGateway}:
 * - `centerHoursOverride.save`      ← {@link save} — persists a dated override.
 * - `centerHoursOverride.getActive` ← {@link getActive} — the override in effect
 *   on a given `YYYY-MM-DD`, or `null`.
 * - `centerHoursOverride.list`      ← {@link list} — every live override for the
 *   Settings manager, or (with a `range`) only those intersecting it, which the
 *   planner uses to gray out the visible week's closed time per column.
 * - `centerHoursOverride.archive`   ← {@link archive} — soft-deletes one override.
 *
 * The in-memory `MockCenterHoursOverridesGateway` stays in the tree for unit
 * tests, which exercise the same interface without Electron.
 */
export interface CenterHoursOverridesGateway {
  list(range?: { start: string; end: string }): Promise<readonly CenterHoursOverrideView[]>;
  save(input: CenterHoursOverrideInput): Promise<CenterHoursOverrideView>;
  getActive(date: string): Promise<CenterHoursOverrideView | null>;
  archive(id: string): Promise<void>;
}

/** The active gateway: the real IPC adapter. Swapping it is this one line. */
export const centerHoursOverridesGateway: CenterHoursOverridesGateway =
  ipcCenterHoursOverridesGateway;
