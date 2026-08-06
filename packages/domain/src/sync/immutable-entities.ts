/**
 * Entities whose writes carry locked decisions — pricing (formulas), amounts
 * and status (invoices, teacher-payouts) — and therefore must never fork across
 * devices. The resolve step (SOU-81) treats a real edit on either side of one
 * of these as divergence: no field merge, no human popup, the sync aborts so
 * the hub's canonical state wins. A device with no local edit still fast-forwards
 * to the canonical state; a both-deleted agreement still applies.
 */
export const IMMUTABLE_ENTITY_TYPES = ['invoices', 'formulas', 'teacher-payouts'] as const;

/** Narrowing guard for `IMMUTABLE_ENTITY_TYPES` — type-safe membership check. */
export function isImmutableEntityType(entityType: string): boolean {
  return (IMMUTABLE_ENTITY_TYPES as readonly string[]).includes(entityType);
}
