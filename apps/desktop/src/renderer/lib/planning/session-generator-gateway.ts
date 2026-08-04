import type { IpcRequest, IpcResponse } from '../../../shared/ipc/contract';
import { ipcSessionGeneratorGateway } from './ipc-session-generator-gateway';

/** The engine config the dry-run preview accepts (`session.generator.preview` request). */
export type GeneratorPreviewConfig = IpcRequest<'session.generator.preview'>;
/** The `[startDate, endDate]` / `[startDate, occurrenceCount]` window the run fills. */
export type GeneratorRange = GeneratorPreviewConfig['range'];
/** The dry-run result: proposals + non-blocking conflicts, zero persistence. */
export type GeneratorPreviewResult = IpcResponse<'session.generator.preview'>;
/** One group's proposed weekly pattern as the preview returns it. */
export type GeneratorGroupProposal = GeneratorPreviewResult['proposals'][number];
/** One proposed block (weekday + `[start, end)` + assigned room). */
export type GeneratorBlockProposal = GeneratorGroupProposal['blocks'][number];
/** A non-blocking preview warning: a center-hours overrun or a room double-booking. */
export type GeneratorConflict = GeneratorPreviewResult['conflicts'][number];
/** The confirmed proposals + window echoed back to commit (`session.generator.commit`). */
export type GeneratorCommitInput = IpcRequest<'session.generator.commit'>;
/** The per-block commit summary (one template each, its own batch + skipped holidays). */
export type GeneratorCommitResult = IpcResponse<'session.generator.commit'>;

/**
 * The seam the auto-session-generator popup (SOU-159) depends on (Dependency
 * Inversion). Hooks call this interface, never `window.api` directly, so the
 * concrete IPC adapter is swappable in one place with no change to any component.
 *
 * Two channels, both gated by `core.calendar.week` in the domain use cases and
 * both center-scoped in main (the renderer sends no `centerCode`/device/user):
 *
 * - `preview` → `session.generator.preview` — a **dry run**, zero persistence.
 *   Resolves `scope` into concrete groups/teachers/rooms/hours in the domain and
 *   compares against the live committed schedule; returns proposals plus any
 *   non-blocking conflicts for the admin to review before committing.
 * - `commit` → `session.generator.commit` — persists the confirmed proposals,
 *   re-running the composite conflict check against the LIVE schedule at write
 *   time (never trusting a possibly-stale preview).
 */
export interface SessionGeneratorGateway {
  preview(config: GeneratorPreviewConfig): Promise<GeneratorPreviewResult>;
  commit(input: GeneratorCommitInput): Promise<GeneratorCommitResult>;
}

/** The active gateway: the real IPC adapter over the `session.generator.*` channels. */
export const sessionGeneratorGateway: SessionGeneratorGateway = ipcSessionGeneratorGateway;
