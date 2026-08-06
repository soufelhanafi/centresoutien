import type { Brand } from '../value-objects/brand';
import type { PlanId } from '../plans/plans';
import type { EntityEnvelope } from './envelope';

/** ULID id prefix for the center row: `ctr_01HW…`. */
export const CENTER_ID_PREFIX = 'ctr';

export type CenterId = Brand<string, 'CenterId'>;

/**
 * The center's own profile — a **single row per database file** (one DB per
 * center, CLAUDE.md §5ter). Holds identity, address, contact, and logo shown in
 * Settings and on the invoice PDF header.
 *
 * `plan` is a **display-only mirror** (SOU-98): plan authority lives in the
 * tamper-evident license file, resolved at startup by `resolveActivePlan` and
 * enforced by `PlanPolicy`. This field is never read by the gate — it is seeded
 * once at creation and refreshed from the resolved license at startup, so a user
 * editing it in their DB cannot self-upgrade. Never edited through the profile form.
 *
 * Carries the full sync envelope so name/address/logo/contact converge across
 * the center's laptops. Not people-like, so no `naturalKey`. Never hard-deleted.
 */
export type Center = EntityEnvelope & {
  readonly id: CenterId;
  name: string;
  address: string;
  phone: string;
  email: string;
  logoPath: string | null; // relative reference under app data; null when unset
  plan: PlanId;
};
