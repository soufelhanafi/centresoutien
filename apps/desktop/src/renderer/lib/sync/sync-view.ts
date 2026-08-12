import type { SyncConflictDto, SyncResultDto } from '../../../shared/ipc/contract';

/** The sync conflict boundary view — the renderer's projection of the domain
 *  `SyncConflict` (dates already ISO strings on the wire). */
export type SyncConflictView = SyncConflictDto;

export type ConflictResolutionView =
  | { choice: 'take-mine' }
  | { choice: 'take-theirs' }
  | { choice: 'per-field'; fields: Record<string, 'mine' | 'theirs'> };

export type SyncRunResultView = SyncResultDto;

export type ReversalDedupView = SyncRunResultView['reversalDedups'][number];

export type ConflictKind = SyncConflictView['kind'];

export type DuplicateView =
  | { readonly kind: 'probable-duplicate'; readonly conflict: Extract<SyncConflictView, { kind: 'probable-duplicate' }> }
  | { readonly kind: 'payment-reversal-dedup'; readonly dedup: ReversalDedupView };

/** Group conflicts by popup tab: field clashes, delete-vs-edit, duplicates. */
export function groupSyncConflicts(input: {
  readonly conflicts: readonly SyncConflictView[];
  readonly reversalDedups?: readonly ReversalDedupView[];
}): {
  fieldClashes: readonly SyncConflictView[];
  deleteVsEdits: readonly SyncConflictView[];
  duplicates: readonly DuplicateView[];
} {
  const { conflicts, reversalDedups = [] } = input;
  return {
    fieldClashes: conflicts.filter((c) => c.kind === 'field-clash'),
    deleteVsEdits: conflicts.filter((c) => c.kind === 'delete-vs-edit'),
    duplicates: [
      ...conflicts
        .filter((c): c is Extract<SyncConflictView, { kind: 'probable-duplicate' }> => c.kind === 'probable-duplicate')
        .map((conflict) => ({ kind: 'probable-duplicate' as const, conflict })),
      ...reversalDedups.map((dedup) => ({ kind: 'payment-reversal-dedup' as const, dedup })),
    ],
  };
}

export function groupConflicts(conflicts: readonly SyncConflictView[]) {
  return groupSyncConflicts({ conflicts });
}
