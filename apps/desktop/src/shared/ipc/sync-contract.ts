import { z } from 'zod';

/**
 * The presentation projections of sync state across the IPC boundary (SOU-91).
 * Conflict snapshots are stripped to what the popup renders: who / when / what,
 * plus the two full entity snapshots for "Prendre ma version" / "Prendre leur
 * version" and per-field resolution. Dates are serialized to ISO strings,
 * exactly like every other view schema in `contract.ts`. Timestamps are display
 * context only — ordering is decided by `version`, never by these.
 */

export const conflictSideViewSchema = z.object({
  updatedBy: z.string(),
  deviceId: z.string(),
  op: z.enum(['create', 'update', 'delete']),
  changedFields: z.array(z.string()),
  at: z.string(),
  entity: z.record(z.string(), z.unknown()),
});

export type ConflictSideDto = z.infer<typeof conflictSideViewSchema>;

const duplicateReasonSchema = z.enum([
  'same-name-phone',
  'shared-phone',
  'shared-guardian',
  'separated-family',
]);

export const syncConflictViewSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('field-clash'),
    entityType: z.string(),
    entityId: z.string(),
    version: z.number().int().nonnegative(),
    fields: z.array(z.string()),
    mine: conflictSideViewSchema,
    theirs: conflictSideViewSchema,
  }),
  z.object({
    kind: z.literal('delete-vs-edit'),
    entityType: z.string(),
    entityId: z.string(),
    version: z.number().int().nonnegative(),
    mine: conflictSideViewSchema,
    theirs: conflictSideViewSchema,
  }),
  z.object({
    kind: z.literal('probable-duplicate'),
    entityType: z.string(),
    keptId: z.string(),
    candidateId: z.string(),
    tier: z.enum(['exact', 'fuzzy']),
    reason: duplicateReasonSchema,
  }),
]);

export const syncRunRequestSchema = z.object({});

export const reversalDedupViewSchema = z.object({
  entityType: z.literal('payments'),
  reversesPaymentId: z.string(),
  winnerId: z.string(),
  loserId: z.string(),
});

export const syncResultViewSchema = z.object({
  status: z.enum(['synced', 'retries-exhausted']),
  applied: z.number().int().nonnegative(),
  pushed: z.number().int().nonnegative(),
  conflicts: z.array(syncConflictViewSchema),
  reversalDedups: z.array(reversalDedupViewSchema),
  deviceClockSkew: z.boolean(),
  resolutionPermission: z.enum(['granted', 'queued']),
});

export const syncResolveRequestSchema = z.object({
  entityType: z.string(),
  entityId: z.string(),
  resolution: z.discriminatedUnion('choice', [
    z.object({ choice: z.literal('take-mine') }),
    z.object({ choice: z.literal('take-theirs') }),
    z.object({
      choice: z.literal('per-field'),
      fields: z.record(z.string(), z.enum(['mine', 'theirs'])),
    }),
  ]),
});

/** E2E-only conflict seed (SOU-91): writes one blocked field-clash through the
 *  real `SqliteLocalSyncRepository` on the app's own connection, so a spec
 *  never opens the encrypted DB from a second process (WAL race). Registered
 *  only in `--mode e2e` builds; absent in production exactly like `plan.set`. */
export const syncSeedConflictRequestSchema = z.object({
  entityType: z.string(),
  entityId: z.string(),
  mineEntity: z.record(z.string(), z.unknown()),
  theirsEntity: z.record(z.string(), z.unknown()),
  fields: z.array(z.string()),
  version: z.number().int().nonnegative(),
});

export const syncIpcContract = {
  'sync.run': {
    request: syncRunRequestSchema,
    response: z.object({ result: syncResultViewSchema.nullable() }),
  },
  'sync.conflicts.list': {
    request: z.object({}),
    response: z.object({ conflicts: z.array(syncConflictViewSchema) }),
  },
  'sync.conflict.resolve': {
    request: syncResolveRequestSchema,
    response: z.object({ ok: z.literal(true) }),
  },
  'sync.test.seedConflict': {
    request: syncSeedConflictRequestSchema,
    response: z.object({ ok: z.literal(true) }),
  },
} as const;
