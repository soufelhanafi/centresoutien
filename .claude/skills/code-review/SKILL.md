---
name: code-review
description: Perform a rigorous self-review or peer review of any diff in the Centre Soutien Electron repo using a fixed 22-point checklist covering architecture, testing, i18n, RTL, plan gating, sync safety, and code quality. Use this skill whenever preparing to open a pull request, whenever reviewing someone else's pull request, whenever a large refactor is about to merge, and whenever the user says "review", "check my code", "look at this diff", "ready to merge", or "am I missing anything". Also use this skill after generating any non-trivial code — do the self-review before presenting the change. Err on the side of triggering — one skipped review costs a week of production debugging.
---

# Code Review — Centre Soutien Desktop

Reviewers do not read code linearly. They walk a checklist. This skill is that checklist. Use it on your own diff before you open the PR, and use it on someone else's diff before you approve it.

Total time: **10–15 minutes** on a medium PR. If a check takes longer, it's a finding — surface it and ask the author.

---

## Step 1 — Understand the change in one sentence

Before opening any file, read the PR title and description. Write a sentence in your own words that answers: *what does this change and why?* If you can't, ask the author. Reviewing code you don't understand is worse than not reviewing at all.

---

## Step 2 — Walk the 22-point checklist

Copy this into the PR description as you review. Every box must be ticked, N/A, or have a comment explaining why it was skipped.

### Architecture (skill: `clean-architecture`)

- [ ] **1.** Each new file lives in the right layer. No `better-sqlite3`, `fs`, `path`, or `electron` in `packages/domain/src/`. No React in `packages/domain/src/` or `apps/desktop/src/data/`. No repository / use-case implementation imported into `apps/desktop/src/renderer/`.
- [ ] **2.** `pnpm typecheck:domain` passes. The domain compiles in isolation.
- [ ] **3.** New ports are narrow (interface segregation) and live in `packages/domain/src/ports/`. New adapters implement them in `apps/desktop/src/data/`.
- [ ] **4.** The composition root is the only place that wires concretes to ports. No `new SqliteXRepository()` anywhere else.

### SOLID & code quality (skill: `solid-coding`, `component-size-limits`)

- [ ] **5.** Every file, function, component, hook, and use case is under the hard ceilings (200 lines / 40 lines / 6 props / cyclomatic 10 / 3 useState). No suppressions.
- [ ] **6.** No `any` in application code. `unknown` at boundaries with Zod narrowing is fine.
- [ ] **7.** No `plan.id === 'premium'`-style plan check outside `packages/domain/src/plans/` or `PlanPolicy`.
- [ ] **8.** No commented-out code, no dangling `console.log`, no orphan `TODO` without owner + date.

### Testing (skill: `unit-testing`, `e2e-testing`)

- [ ] **9.** Every new use case, policy, and pure function has a Vitest test. Coverage on `packages/domain/src/` did not drop below 90%.
- [ ] **10.** Every new user-facing flow has (or updates) an E2E spec, or is explicitly covered by an existing one — call it out.
- [ ] **11.** Bug fixes in domain code include a regression test committed **before** the fix.
- [ ] **12.** Tests inject `Clock` and `IdGenerator`; none call `new Date()` or `Math.random()` in the code under test.

### i18n & RTL

- [ ] **13.** Every new user-facing string is in `fr.json` **and** `ar.json`. Keys match. No English fallbacks.
- [ ] **14.** No `pl-*`, `pr-*`, `ml-*`, `mr-*`, `left-*`, `right-*` Tailwind classes were added. Logical properties only.
- [ ] **15.** Directional icons (arrows, chevrons, back buttons) are mirrored in RTL. Verified by the RTL E2E or a visual check.

### Plan gating (skill: `plan-feature-gate`)

- [ ] **16.** New gated features have a `FeatureFlag` entry in `plans.ts`. The domain use case calls `plan.require(...)`. The UI uses `useFeature(...)` — never a plan-name comparison.
- [ ] **17.** New limits (max students / teachers / rooms) are enforced by the domain and surfaced with the standard upgrade CTA on the UI.

### Sync safety (skills: `sync-safe-entities`, `sync-hub-protocol`)

- [ ] **18.** New entities carry the full envelope: `id`, `centerCode`, `createdAt`, `updatedAt`, `updatedBy`, `deletedAt`, `deviceOrigin`, `version`. People-like entities also have `naturalKey`. No hard deletes anywhere. Timestamps come from the `Clock` port, in UTC.
- [ ] **19.** Every mutation bumps `updatedAt` and records changed field names. Every delete sets `deletedAt` and returns success without removing the row. Payments are inserted, never updated; invoice status is derived.
- [ ] **20.** Sync code keeps the hub dumb: no merge/resolution logic outside `packages/domain/src/sync` and the merge use cases; no wall-clock auto-resolution; delete-vs-edit is never auto-resolved; duplicate matching is parents-first with E.164 phones.

### Tenancy (skill: `multi-center-tenancy`)

- [ ] **21.** Nothing reads or writes across `centreId` boundaries. Center context is an explicit parameter; cursors and hub calls carry `(deviceId, centreId)`. Cross-center features sit behind `org.multi-center`.

### Ship-readiness

- [ ] **22.** `pnpm typecheck:domain && pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration && pnpm build && pnpm test:e2e` all pass locally. The `pre-merge-check` skill was walked end-to-end.

---

## Step 3 — Do the semantic pass

Checklists catch mechanical mistakes. The semantic pass catches design mistakes.

Read the diff a second time with these questions in mind:

1. **Is this the simplest solution to the stated problem?** If the diff includes an abstraction with one caller, ask whether that abstraction is paying for itself.
2. **What breaks if this is called concurrently?** Electron IPC is single-threaded, but the SQLite database can be interleaved with UI reads. Look for TOCTOU (time-of-check-time-of-use) bugs: does the code read a value, decide, then write, without a transaction?
3. **What breaks when a sync arrives mid-operation?** Any entity being written must be safe to be read partially by the sync engine. Prefer transactional writes and stable read snapshots.
4. **Does this compose with the plan gating?** A "small helper" that skips `PlanPolicy` is a revenue leak.
5. **Would this pass the "web reuse" test?** If we lifted the domain into a Node backend tomorrow, would the change come with us clean? If no, it's not in the right layer.
6. **What is the *worst thing* a user could do to this feature?** Empty inputs, giant inputs, all-emoji names, phone numbers with spaces, dates in the past, dates in the future, negative money, `null`, `undefined`, `NaN`. Test at least the top three.

---

## Step 4 — Leave good comments

If you find a problem, comment it well. A useful review comment has three parts:

1. **What** you observed.
2. **Why** it's a problem (link a skill if there is one).
3. **Concretely how** to fix it.

Bad: "This is too coupled."
Good: "The `<InvoiceRow />` component imports `formatMoney` from `apps/desktop/src/data/pdf/formatters.ts`, which puts a Data-layer import in the renderer. See the forbidden imports table in `clean-architecture`. Move `formatMoney` to `apps/desktop/src/renderer/lib/money.ts` (or into the domain if it's used by other layers too)."

Prefix with severity so the author can triage:

- **`nit:`** — cosmetic or preference. Author may resolve without changing code.
- **`suggestion:`** — worth doing but not blocking.
- **`must:`** — blocks merge. Any of the 20 checklist items failing is a `must`.
- **`question:`** — you don't understand, ask before assuming.

Never leave a `must` without a fix path.

---

## Step 5 — Approve, request changes, or ask questions

Choose exactly one:

- **Approve** — every `must` is resolved and you'd be comfortable shipping the diff on Friday afternoon.
- **Request changes** — one or more `must` items remain.
- **Comment / ask** — you need clarification and cannot judge until you get it.

Do not approve as a favor. A rubber-stamp is a bug in the review process, not a kindness.

---

## Step 6 — Author's response protocol

When you receive a review:

- Reply to every non-nit comment explicitly. "Done in commit `abc123`" or "Not doing because X."
- Do not resolve a comment as the author unless it's a nit. Let the reviewer resolve `must` and `suggestion` comments.
- If you disagree with a `must`, argue the case in the thread. Do not dismiss silently.
- Force-push is allowed on your own branch until first review. After the first review, add fixup commits so the reviewer can see what changed.

---

## Step 7 — Post-merge sanity check

Within an hour of merge:

- Watch the main-branch CI turn green (or roll back).
- Check the first E2E run against the built installer.
- If a bug ships that the checklist should have caught, add a check to the relevant skill so it can't slip again.

---

## Common review anti-patterns

| Symptom | Fix |
|---|---|
| Reviewer only looks at the diff, not the surrounding code. | Open the whole file for changes larger than 30 lines. Diffs hide context. |
| Reviewer asks for a change but doesn't say why. | The `must:` comment must reference a skill or an invariant. |
| Author bundles unrelated changes into one PR. | Ask them to split. Small PRs are reviewed well; big PRs are rubber-stamped. |
| Reviewer approves after skimming the description. | Re-open the checklist. |
| A `must` becomes a follow-up ticket. | If it were acceptable as a follow-up, it wouldn't have been a `must`. Block. |
