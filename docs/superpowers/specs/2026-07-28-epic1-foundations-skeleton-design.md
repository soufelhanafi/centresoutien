# Epic 1 — Foundations: Skeleton Slice (Session 1)

**Linear:** [SOU-5 Epic 1 — Foundations](https://linear.app/soufelhanafi/issue/SOU-5)
**Tickets in this slice:** SOU-88, SOU-17, SOU-89 (partial), SOU-23
**Date:** 2026-07-28
**Status:** approved (design), pending implementation

---

## Goal (one sentence)

Stand up a pnpm-workspaces monorepo skeleton that typechecks, tests, and enforces its own architecture rules from commit #1 — with **zero domain/data/UI logic yet**.

## Scope

**In:**
- **SOU-88** — pnpm workspace skeleton: `apps/{desktop,landing}` + `packages/{domain,ui,config}`, path/graph wiring, root scripts.
- **SOU-17** — ESLint import boundaries: Presentation→Domain, Data→Domain; domain has zero framework imports.
- **SOU-89 (partial)** — pre-merge grep gates only (`no new Date()` in domain, `no DELETE FROM`, `no AUTOINCREMENT`), wired as `pnpm gate` + CI. Skills are already installed (11); the 12th (`migration-authoring`) is **deferred** by decision.
- **SOU-23** — Vitest workspace (`domain` no-DOM project + `data` node project), coverage, `pnpm test` < 5s.

**Explicitly out (later sessions / own PRs):**
- SOU-15 Electron shell, SOU-16 renderer, SOU-18 SQLCipher, SOU-19 entity base, SOU-20 plan gating, SOU-21 i18n, SOU-22 tokens, SOU-24 Playwright.
- Importing the live landing site into `apps/landing` (its own migration PR — see memory `landing-site-consolidation`).
- `migration-authoring` skill (deferred).

## Design

### Directory tree
```
monorepo/
├── pnpm-workspace.yaml
├── package.json                 # root scripts (typecheck/test/lint/gate), devDeps, packageManager pin
├── tsconfig.base.json           # thin root base pointing at packages/config
├── vitest.workspace.ts          # projects: domain, data
├── .npmrc                       # engine-strict
├── scripts/pre-merge-gate.mjs   # SOU-89 grep gates
├── packages/
│   ├── config/                  # shared presets = the guardrails
│   │   ├── tsconfig.base.json   #   strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes
│   │   ├── tsconfig.domain.json #   extends base, lib=["ES2022"] (NO dom)
│   │   ├── eslint.base.mjs
│   │   ├── eslint.boundaries.mjs
│   │   └── prettier.config.mjs
│   ├── domain/                  # portable core — ZERO workspace deps
│   │   └── src/index.ts + src/__tests__/smoke.test.ts
│   └── ui/                      # stub now (buildable, empty); populated in SOU-16
├── apps/
│   ├── desktop/                 # minimal buildable stub; Electron = SOU-15
│   │   └── src/main/index.ts
│   └── landing/                 # placeholder (README only) — imported later
└── .github/workflows/ci.yml     # CLAUDE.md §9 gate order: lint → typecheck → test → gate
```

### Tooling decisions
- pnpm workspaces; `packageManager` pinned. **No Turborepo yet** (YAGNI — add when builds slow).
- TypeScript strict everywhere + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
- `packages/domain` uses `lib: ["ES2022"]` (no `dom`) so a DOM/React global fails typecheck — backing up the eslint rule.
- ESM throughout (`"type": "module"`).
- Domain isolation enforced **twice**: (1) `packages/domain/package.json` has zero workspace deps → graph can't resolve `apps/*`; (2) eslint `no-restricted-imports` bans `react`, `electron`, `better-sqlite3*`, `fs`, `path`, `os`, `exceljs`, `pdf-lib`.

### Per-ticket done criteria (this session)
- **SOU-88:** `pnpm -r typecheck && pnpm -r test && pnpm --filter desktop build` pass from root; domain resolves nothing from `apps/*`.
- **SOU-17:** a domain file importing React fails `pnpm lint` (red/green demonstrated, offending file removed).
- **SOU-89:** `pnpm gate` catches a planted `new Date()` / `DELETE FROM` / `AUTOINCREMENT`; runs in CI.
- **SOU-23:** two Vitest projects run in < 5s with coverage reported.

### Approach
- TDD where there is logic: the gate script has a test proving it catches a planted violation; the eslint boundary is shown red then green.
- Conventional commits, one concern each: `chore: pnpm workspace skeleton`, `build: shared tsconfig/eslint presets`, `ci: pre-merge grep gates`, `test: vitest workspace`.
- Stop for review after the skeleton — before any domain code (SOU-19 next).

## Risks / notes
- `apps/desktop` is a buildable stub only; real Electron wiring is SOU-15. The stub `build` script must not imply Electron is done.
- CI workflow is minimal; expands as later tickets land.
