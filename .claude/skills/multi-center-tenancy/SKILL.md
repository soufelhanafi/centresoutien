---
name: multi-center-tenancy
description: Keep Centre Soutien's multi-center support as a thin authorization and packaging layer that never leaks into the domain, sync, or billing math. Use this skill whenever a task mentions "organization", "multiple centers", "multi-centre", "center switcher", "membership", "role", "cross-center", "consolidated", "tenant", "centreId", "centerCode", opening or creating a center database, or touches the Organization/Membership entities, the center switcher in the app shell, per-center DB files, or any query that could read across centers. Err on the side of triggering — a cross-tenant read is a data leak between businesses, and a cross-tenant write is unrecoverable corruption.
---

# Multi-Center Tenancy — Centre Soutien

An admin may own or manage several centers. The architectural rule, stated once and enforced everywhere:

> **The Center is the tenant. Multi-center is an authorization layer above it — it must never leak into sync, matching keys, billing math, or any domain rule.**

Everything already designed — sync cycle, conflict popup, duplicate matching, invoices, entitlements — is scoped to one center and stays that way.

---

## 1. The model

Two thin entities on top of the existing domain:

```ts
// packages/domain/src/entities/organization.ts
export type Organization = EntityEnvelope & {
  readonly id: OrganizationId;
  name: string;
  billingContact: ContactInfo;      // receives ONE consolidated invoice for all its centers
};

// packages/domain/src/entities/membership.ts
export type Membership = EntityEnvelope & {
  readonly id: MembershipId;
  readonly userId: UserId;
  readonly centreId: CentreId;
  role: 'owner' | 'admin' | 'secretary' | 'viewer';
};
```

- A user belongs to N centers via N memberships, with possibly **different roles in each** (owner of two, viewer of a third they consult for).
- No use case assumes "the user's center" — every use case **receives a center context** that was *selected*, and authorization = "does a membership exist for (user, centre) with a sufficient role?".
- The same child attending two centers of one owner is **legitimately two records** — different invoices, groups, attendance. Never unify people across centers; the `naturalKey` and duplicate matching are per-center by construction.

## 2. Desktop: one DB file per center + a switcher

- **One SQLCipher file per center** (`centre-{centreId}.db`), not one file with `centreId` columns doing double duty. Total isolation for free, per-center backup, and sync untouched.
- The app shell has a **center switcher** (login or header). Switching = close current DB, open the other. The whole app then operates in that scope exactly as a single-center install.
- **No merged cross-center views in the desktop app.** The admin's laptop cannot guarantee fresh data for centers it doesn't actively sync; a stale consolidated dashboard is worse than none.

## 3. Sync: only addressing changes

- `SyncHubPort` calls carry `centreId`; cursors are per `(deviceId, centreId)`. Nothing else in `sync-hub-protocol` changes — a conflict never spans centers.
- Embedded hubs: each center typically has its own hub laptop on its own premises. One machine may host two centers' hubs (two canonical stores, two token scopes) but the stores never mix.
- Cloud hub: `centreId` becomes tenant scoping in Postgres. Every API route derives the allowed set of `centreId`s from the caller's memberships — never from a client-supplied parameter alone.

## 4. Cross-center consolidation = cloud + Premium

Org-wide revenue, consolidated dashboards, copying a formula/template between centers: these are **aggregation reads over multiple tenants** and belong in the cloud/web tier behind the `org.multi-center` flag (Premium). The technical dependency (only the cloud hub has fresh data for all centers) and the entitlement align — keep it that way. The desktop app links out or upsells; it does not fake the view from stale local files.

## 5. Billing

- **The plan/license attaches to the center**, not the organization. One org can run Essentiel in a small annex and Premium in the flagship — matches how these businesses account for costs, and preserves the current "one center, one license" model unchanged.
- The **organization is the billing contact**: one consolidated invoice listing each center's plan.
- `PlanPolicy` is therefore constructed per active center. Never a global "the user's plan".

## 6. Checklist for any center-scoped change

- [ ] The use case receives `centreId` (or the opened center DB) explicitly — no ambient "current center" global in the domain.
- [ ] Authorization checks membership `(userId, centreId, role)`; UI role-hiding is cosmetic only.
- [ ] No query, key, cache, or file path spans two `centreId`s.
- [ ] Sync cursors, hub calls, and conflict objects carry the `centreId` they belong to.
- [ ] Anything cross-center is gated by `org.multi-center` and routed to the cloud tier.
- [ ] Tests include a negative case: a user with membership in center A is rejected on center B.

## 7. Common mistakes

| Mistake | Fix |
|---|---|
| One SQLite file with `centreId` columns for all centers on desktop. | One encrypted DB file per center; the switcher swaps files. |
| "The user's center" fetched from a singleton/store inside the domain. | Center context is a parameter, selected in the shell, passed down. |
| Duplicate matching or `naturalKey` comparing across centers. | Matching is per-center by definition. |
| Consolidated dashboard computed from local desktop files. | Cloud-only, `org.multi-center`, Premium. |
| Plan resolved from the organization. | Plan/license per center; org is only the billing contact. |
| API trusting a `centreId` from the request body. | Derive the allowed centers from the caller's memberships server-side. |
