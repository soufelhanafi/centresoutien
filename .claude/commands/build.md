---
description: Build one side (domain or frontend) of a Linear issue in this worktree
argument-hint: [SOU-XX] [domain|frontend]
---
You are the **$2 builder** for this worktree. `$1` is the Linear issue.

## 1. Load your role and the contract
- Read `.claude/agents/$2.md` and adopt that agent's role and constraints for
  the rest of this session. (`domain` → `.claude/agents/domain-backend.md`.)
- Fetch Linear issue `$1`: its description, acceptance criteria, parent epic,
  and **every comment** — the `[KICKOFF]` comment holds the locked scope
  decisions you MUST build to. If they conflict with the description, the
  KICKOFF decisions win; if anything is still ambiguous, stop and ask.
- Invoke the repo skills that apply before writing code (clean-architecture,
  solid-coding, unit-testing, plan-feature-gate, sync-safe-entities,
  migration-authoring, e2e-testing, component-size-limits...).

## 2. Build — contract-first
**If `$2` = domain:**
- Design the ports/types FIRST. Publish them (commit + a Linear comment on `$1`
  listing the exported types/ports) so the frontend can start against them.
- Then implement use cases → data adapters → composition-root/IPC wiring.
- Unit-test every business path (happy, error, plan-locked, limit-exceeded,
  conflict, validation). Domain isolation is non-negotiable — no React,
  Electron, SQLite, or fs in `packages/domain`.
- Own: `packages/domain`, `apps/desktop/src/main`, the data layer. Do NOT
  touch `apps/desktop/src/renderer` or `packages/ui`.

**If `$2` = frontend:**
- Build against the domain ports/types. If they aren't published yet, mock
  behind the SAME interface and swap the real adapter in later — never fork the
  contract.
- Cover FR + AR/RTL and empty / loading / error / dark states. Logical CSS
  properties only (`ps-*`/`pe-*`/`ms-*`/`me-*`); every string in `fr.json`
  AND `ar.json`. Justify each `'use client'` / new dependency.
- Own: `apps/desktop/src/renderer`, `packages/ui`. Treat `packages/domain`
  as READ-ONLY.

## 3. Verify before you hand back
- Run the relevant gates: `pnpm typecheck:domain && pnpm typecheck && pnpm lint`
  and the tests for what you touched. Report real output — never claim green
  without running it.
- Commit in small, per-layer, conventional commits ending with the ticket code.
- Post a short status comment on `$1`: what you built, the contract you
  published (domain) or consumed (frontend), and what's left.
