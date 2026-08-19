// Presentation-only resolution for the "Facture groupée" action (SOU-284): given a
// student's guardians and the invoices screen's active month, decides whether the
// consolidated per-parent statement can be triggered, fired directly, or needs the
// user to pick which responsible. No business logic — the domain is the real gate;
// this only steers the UX.
const CONCRETE_MONTH_PATTERN = /^\d{4}-\d{2}$/;

export type FactureGroupeeBlockReason = 'no-month' | 'no-guardian';

export type FactureGroupeeResolution =
  | { readonly kind: 'blocked'; readonly reason: FactureGroupeeBlockReason }
  | { readonly kind: 'single'; readonly parentId: string }
  | { readonly kind: 'multiple'; readonly guardianIds: readonly string[] };

export function resolveFactureGroupee(
  guardianIds: readonly string[],
  month: string,
): FactureGroupeeResolution {
  if (!CONCRETE_MONTH_PATTERN.test(month)) {
    return { kind: 'blocked', reason: 'no-month' };
  }

  const [firstGuardianId, ...otherGuardianIds] = guardianIds;
  if (firstGuardianId === undefined) {
    return { kind: 'blocked', reason: 'no-guardian' };
  }
  if (otherGuardianIds.length === 0) {
    return { kind: 'single', parentId: firstGuardianId };
  }
  return { kind: 'multiple', guardianIds };
}
