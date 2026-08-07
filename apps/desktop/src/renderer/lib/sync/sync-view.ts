import type { SyncConflictDto, SyncResultDto } from '../../../shared/ipc/contract';

/** The sync conflict boundary view — the renderer's projection of the domain
 *  `SyncConflict` (dates already ISO strings on the wire). */
export type SyncConflictView = SyncConflictDto;

export type ConflictResolutionView =
  | { choice: 'take-mine' }
  | { choice: 'take-theirs' }
  | { choice: 'per-field'; fields: Record<string, 'mine' | 'theirs'> };

export type SyncRunResultView = SyncResultDto;

export type ConflictKind = SyncConflictView['kind'];

/** Group conflicts by popup tab: field clashes, delete-vs-edit, duplicates. */
export function groupConflicts(conflicts: readonly SyncConflictView[]): {
  fieldClashes: readonly SyncConflictView[];
  deleteVsEdits: readonly SyncConflictView[];
  duplicates: readonly SyncConflictView[];
} {
  return {
    fieldClashes: conflicts.filter((c) => c.kind === 'field-clash'),
    deleteVsEdits: conflicts.filter((c) => c.kind === 'delete-vs-edit'),
    duplicates: conflicts.filter((c) => c.kind === 'probable-duplicate'),
  };
}
