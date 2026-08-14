/**
 * A center-scoped authorization role (SOU-95). Roles form a **strict linear
 * hierarchy** — `owner > admin > secretary > viewer` — so authorization is a
 * single rank comparison, never a scattered set of per-role conditionals.
 *
 * The literal below is the ONE place the hierarchy lives, written in descending
 * authority so it reads exactly as the spec. Rank is derived from position, so
 * re-ordering or inserting a tier is an edit to this array alone.
 */
export const ROLES = ['owner', 'admin', 'secretary', 'viewer'] as const;

export type Role = (typeof ROLES)[number];

/** True when `value` is one of the known role tokens. */
export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/**
 * The role's authority rank: higher wins. `owner` is the maximum, `viewer` the
 * minimum. Derived from {@link ROLES} so the ordering has a single source.
 */
export function roleRank(role: Role): number {
  return ROLES.length - 1 - ROLES.indexOf(role);
}

/**
 * Whether `actual` satisfies `required` — the sufficiency check the authorization
 * use case runs. A role covers itself and every role beneath it: an `admin`
 * satisfies a `secretary` requirement, a `viewer` satisfies only `viewer`.
 *
 * Fails closed: either argument that is not a known role (a corrupt or
 * deserialized value that bypassed the TS type) is denied outright, so an unknown
 * token can never out-rank `owner` via a negative `indexOf` (SOU-95, Qodo).
 */
export function isRoleSufficient(actual: Role, required: Role): boolean {
  if (!isRole(actual) || !isRole(required)) {
    return false;
  }
  return roleRank(actual) >= roleRank(required);
}
