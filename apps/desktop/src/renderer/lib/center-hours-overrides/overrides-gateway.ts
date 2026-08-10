import type { CenterHoursOverrideInput, CenterHoursOverrideView } from './override-view';
import { mockCenterHoursOverridesGateway } from './mock-overrides-gateway';

/**
 * The seam the dated-override UI depends on (Dependency Inversion). Hooks call
 * this interface, never `window.api` directly, so swapping the concrete adapter
 * is a one-line change with no component edits.
 *
 * ## Contract status (SOU-165 frontend ↔ domain)
 *
 * Requested channels, to be published by the domain in parallel:
 * - `centerHoursOverride.save`      ← {@link save} — persists a dated override.
 * - `centerHoursOverride.getActive` ← {@link getActive} — the override in effect
 *   on a given `YYYY-MM-DD`, or `null`.
 * - `centerHoursOverride.list`      ← {@link list} — every override for the
 *   Settings manager (equivalently "get active override for the full range").
 *
 * Ships against {@link mockCenterHoursOverridesGateway} until the
 * "[PUBLISHED] domain contract" note lands, then a new `ipc-overrides-gateway`
 * maps each method onto its channel and this constant flips to it.
 */
export interface CenterHoursOverridesGateway {
  list(): Promise<readonly CenterHoursOverrideView[]>;
  save(input: CenterHoursOverrideInput): Promise<CenterHoursOverrideView>;
  getActive(date: string): Promise<CenterHoursOverrideView | null>;
}

/** The active gateway. Swapping the mock for the real IPC adapter is this one line. */
export const centerHoursOverridesGateway: CenterHoursOverridesGateway =
  mockCenterHoursOverridesGateway;
