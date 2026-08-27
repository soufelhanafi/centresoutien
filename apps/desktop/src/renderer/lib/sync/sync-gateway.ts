import type {
  SyncConflictView,
  SyncRunResultView,
  ConflictResolutionView,
} from './sync-view';

/** The renderer's seam to the sync IPC surface (SOU-91). Implementations map
 *  to `window.api`; tests can substitute a fake. */
export interface SyncGateway {
  run(): Promise<SyncRunResultView | null>;
  /** Asks the running sync to pause gracefully; it stops at the next chunk boundary. */
  cancel(): Promise<void>;
  listConflicts(): Promise<readonly SyncConflictView[]>;
  resolveConflict(input: {
    entityType: string;
    entityId: string;
    resolution: ConflictResolutionView;
  }): Promise<void>;
}

export class IpcSyncGateway implements SyncGateway {
  async run(): Promise<SyncRunResultView | null> {
    const { result } = await window.api.invoke('sync.run', {});
    return result;
  }

  async cancel(): Promise<void> {
    await window.api.invoke('sync.cancel', {});
  }

  async listConflicts(): Promise<readonly SyncConflictView[]> {
    const { conflicts } = await window.api.invoke('sync.conflicts.list', {});
    return conflicts;
  }

  async resolveConflict(input: {
    entityType: string;
    entityId: string;
    resolution: ConflictResolutionView;
  }): Promise<void> {
    await window.api.invoke('sync.conflict.resolve', input);
  }
}

export const syncGateway: SyncGateway = new IpcSyncGateway();
