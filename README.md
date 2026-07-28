# Centre Soutien Desktop — Skills

Eleven Claude Code skills that enforce the coding standards for the Centre Soutien monorepo (Electron desktop today; cloud API + web SaaS share the same `packages/domain`).

Drop this whole `skills/` folder into `.claude/skills/` at the root of the repo. Claude Code discovers them automatically.

## Skills in this package

| Skill | Purpose |
|---|---|
| `solid-coding` | SOLID, KISS, DRY-with-threshold, YAGNI, TS strictness |
| `clean-architecture` | Presentation / Domain / Data isolation, ports and adapters |
| `component-size-limits` | Concrete size ceilings on files, functions, components, hooks |
| `unit-testing` | Vitest structure, in-memory fakes, table-driven policies, 90% domain coverage |
| `e2e-testing` | Playwright + Electron patterns, fresh-DB fixtures, RTL run |
| `code-review` | 22-point self-review + peer-review checklist |
| `plan-feature-gate` | Multi-plan feature flags, domain-enforced, `useFeature` in UI |
| `sync-safe-entities` | ULID IDs, full envelope (`version`, `updatedBy`), natural keys, soft delete, per-field change log, append-only payments |
| `sync-hub-protocol` | Hub-and-spoke sync, `SyncHubPort`, pull→resolve→push, optimistic concurrency, conflict popup, parents-first dedup |
| `multi-center-tenancy` | Organization/Membership layer, one DB per center, center switcher, tenant isolation |
| `pre-merge-check` | Final ordered gate before any merge |

## Order of authority (when skills conflict)

1. `pre-merge-check` — last line of defense.
2. `clean-architecture` — architectural integrity.
3. `sync-safe-entities` + `sync-hub-protocol` — data correctness (data loss risk).
4. `multi-center-tenancy` — tenant isolation (data leak risk).
5. `plan-feature-gate` — revenue correctness.
6. `unit-testing` / `e2e-testing` — proof of correctness.
7. `solid-coding` — code quality.
8. `component-size-limits` — code quality.
9. `code-review` — meta / process.

## Maintaining the skills

If a bug ships to production that a skill should have caught, update that skill so it can't happen again. The skills are the memory of past mistakes.
