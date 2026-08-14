import type { Brand } from '../value-objects/brand';
import type { EntityEnvelope } from './envelope';

/** ULID id prefix for organizations: `org_01HW…`. */
export const ORGANIZATION_ID_PREFIX = 'org';

export type OrganizationId = Brand<string, 'OrganizationId'>;

/**
 * An organization owns or manages one or more centers (CLAUDE.md §5ter). It is
 * an **authorization + packaging layer only** — it never becomes a tenant:
 * sync scopes, cursors, matching keys, and billing math all stay per-center.
 * Cross-center consolidation is the cloud-only Premium `org.multi-center`
 * capability, not a property of this row.
 *
 * `billingContact` is the org-level contact that receives the consolidated
 * invoice; the plan/license still attaches to each center individually.
 *
 * Carries the full sync envelope so the row converges across a center's laptops
 * like any other entity — reusing the shared envelope keeps sync uniform and is
 * NOT a claim that the org is bound to one tenant. Not people-like, so no
 * `naturalKey`. Never hard-deleted.
 */
export type Organization = EntityEnvelope & {
  readonly id: OrganizationId;
  name: string;
  billingContact: string;
};
