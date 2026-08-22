/**
 * Entities whose writes carry locked decisions — pricing (formulas), amounts
 * and status (invoices, teacher payouts) — and therefore must never fork across
 * devices. The resolve step (SOU-81) treats an edit touching one of the type's
 * protected fields as divergence: no field merge, no human popup, the sync
 * aborts so the hub's canonical state wins. A device with no local edit still
 * fast-forwards to the canonical state; a both-deleted agreement still applies.
 *
 * `entityType` values are the physical table names — the change-log convention
 * (change-log-writer.ts): `invoices`, `formulas`, `teacher_payouts`.
 */
const IMMUTABLE_ENTITY_TYPES = ['invoices', 'formulas', 'teacher_payouts'] as const;
export type ImmutableEntityType = (typeof IMMUTABLE_ENTITY_TYPES)[number];

/**
 * Per-type protected domain fields. Only an edit touching one of these diverges.
 * Documented mutable fields on immutable entities (Formula.name, Formula.active,
 * TeacherPayout.notes) are ordinary data and merge like any other field.
 */
export const IMMUTABLE_ENTITY_PROTECTED_FIELDS: Record<ImmutableEntityType, ReadonlySet<string>> = {
  invoices: new Set(['status', 'issuedAt', 'cancelledAt']),
  formulas: new Set(['priceMad', 'subjectIds', 'subjectPrices']),
  teacher_payouts: new Set(['amountMad', 'baseAmountMad', 'percentSnapshot', 'ruleKind', 'status']),
};

/** Narrowing guard for the immutable entity types — type-safe membership check. */
export function isImmutableEntityType(entityType: string): entityType is ImmutableEntityType {
  return (IMMUTABLE_ENTITY_TYPES as readonly string[]).includes(entityType);
}
