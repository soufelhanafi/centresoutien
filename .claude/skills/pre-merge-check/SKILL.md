---
name: pre-merge-check
description: Run the final, ordered gate that must pass before any branch is merged into `main` in the Centre Soutien Electron repo. Use this skill immediately before opening a pull request, immediately before requesting review, and immediately before clicking merge. Also run it after every rebase on `main`. Trigger on phrases like "ready to merge", "final check", "before I open the PR", "CI green", "ship it", "release", or "green light". This is the last line of defense — run it even for one-line changes, because one-line changes are how i18n keys, plan flags, and RTL classes silently break.
---

# Pre-Merge Check — Centre Soutien Desktop

Runs in **strict order**. Each step is a hard gate — if it fails, stop and fix, do not proceed to later steps. Total time on a healthy repo: 4–8 minutes for the local checks, plus CI.

Copy this into the PR description as a checklist and tick as you go.

---

## Gate 1 — Domain isolation

```bash
pnpm typecheck:domain
```

The strictest signal. Compiles `packages/domain/src/` alone with `tsconfig.domain.json`, which excludes the DOM lib and infra path aliases. If this fails, an infrastructure import leaked into the domain layer.

Also run:

```bash
grep -R "from 'better-sqlite3'" packages/domain apps/desktop/src/renderer
grep -R "from 'react'" packages/domain apps/desktop/src/data
grep -R "from 'electron'" packages/domain apps/desktop/src/data
grep -R "from 'fs'" packages/domain apps/desktop/src/renderer
grep -R "from 'pdf-lib'" packages/domain
grep -R "from 'exceljs'" packages/domain
```

All must return **nothing**. If any returns a match, restructure per the `clean-architecture` skill before continuing.

---

## Gate 2 — Full type-check

```bash
pnpm typecheck
```

The whole repo compiles with `tsconfig.json` in strict mode. No `any`, no unused, no implicit-any, no unchecked index access, no missing return types on exported functions.

---

## Gate 3 — Lint

```bash
pnpm lint
```

ESLint with:

- `@typescript-eslint` recommended-type-checked.
- `import/no-restricted-paths` for layer boundaries (fails if an `apps/desktop/src/renderer` file imports from `apps/desktop/src/data`, etc.).
- `react-hooks/rules-of-hooks` + `react-hooks/exhaustive-deps`.
- `max-lines`, `max-lines-per-function`, `max-params`, `complexity`, `max-depth`.
- A custom rule (or a grep in CI) that forbids `pl-*`, `pr-*`, `ml-*`, `mr-*`, `left-*`, `right-*` Tailwind classes outside allowlisted files.
- A custom rule (or a grep) that forbids the literals `'essentiel'`, `'pro'`, `'premium'` outside `packages/domain/src/plans/`, tests, translations, and analytics event constants.

Zero warnings. Warnings become errors in CI.

---

## Gate 4 — Format

```bash
pnpm format:check
```

Prettier check. On failure, run `pnpm format` and commit as a separate `chore: format` commit.

---

## Gate 5 — Unit tests

```bash
pnpm test:run -- --coverage
```

- All unit tests pass.
- Coverage on `packages/domain/src/` is ≥ 90% lines and branches. If your PR dropped it, add tests.
- Every new use case, policy, and pure function has at least one test.
- Every domain bug fix has a regression test **committed before** the fix commit.

---

## Gate 6 — Integration tests

```bash
pnpm test:integration
```

SQLite adapter tests against `:memory:`. Excel and PDF round-trip tests. All green.

---

## Gate 7 — Build

```bash
pnpm build
```

Both main and renderer bundles produce artifacts. `dist/` or `out/` is populated. No build warnings that weren't there before.

Sanity-check the artifact size against `main`:

```bash
du -sh out/renderer/*.js | sort -h | tail
```

A jump of >10% in a bundle is worth a comment in the PR.

---

## Gate 8 — E2E tests

```bash
pnpm test:e2e
```

Playwright drives the packaged Electron app.

- All specs pass locally (retries: 0).
- If a spec is genuinely flaky, hunt the cause per the `e2e-testing` skill — never `test.skip()` past it.
- The RTL Arabic spec passes.
- Every gated feature has at least one lock-verification E2E on a lower plan.

---

## Gate 9 — i18n parity

```bash
node scripts/check-i18n.mjs
```

The script diffs keys between `fr.json` and `ar.json`:

- Every key in FR is in AR, and vice versa.
- No empty string values.
- No untranslated markers like `__TODO__`.

If keys mismatch, fix the JSONs. If AR is legitimately awaiting translation, the PR is not ready to merge — coordinate with translation.

---

## Gate 10 — RTL smoke

Boot the app with `--locale=ar` (or the E2E RTL fixture already ran):

- `html[dir="rtl"]` is set.
- Sidebar is on the right; content flows right-to-left.
- Money columns are still right-aligned in the LTR-numerical sense (Latin digits, monospace).
- Directional icons (arrows, chevrons, back) are mirrored.
- No horizontal scrollbar appears on any page at 1280×800.

The RTL Arabic E2E spec covers most of this; the smoke test is your own eyeball check on any new UI area.

---

## Gate 11 — Plan-gating audit

For every gated feature touched in this PR:

- [ ] There is exactly one entry in `plans.ts` naming the flag.
- [ ] The domain use case calls `PlanPolicy.require('...')` at the top.
- [ ] The UI hides / disables the feature via `useFeature('...')`, never `plan.id === ...`.
- [ ] Unit test asserts both the locked path (throws `PlanFeatureUnavailableError`) and the unlocked path.
- [ ] E2E asserts the lock treatment on at least one lower plan.

Grep confirmation:

```bash
grep -RE "plan(\.)?id\s*===" apps/desktop/src apps/web/src
grep -RE "'essentiel'|'pro'|'premium'" apps/desktop/src apps/web/src \
  --exclude-dir=__generated__
```

Both should be empty (allowlist tests and translations).

---

## Gate 12 — Sync-safety audit

For every entity or repository change in this PR:

- [ ] New entity extends `EntityEnvelope` and has `id`, `centerCode`, `deviceOrigin`, `createdAt`, `updatedAt`, `updatedBy`, `deletedAt`, `version`.
- [ ] People-like entity has `naturalKey`, computed at create only, with a unique partial index.
- [ ] Repository has `softDelete`; no `DELETE FROM` anywhere except allowed sync-tombstone reaping paths (there are none in v2).
- [ ] Every write bumps `updatedAt` and records changed field names (the field-merge engine depends on it).
- [ ] No timestamp created outside the `Clock` port; all stored times are UTC.
- [ ] Financial writes are append-only (`Payment` insert); no direct write to a derived status column.
- [ ] Migration is additive on live tables. No drops, no renames, no destructive alters.

If the PR touches sync (`packages/domain/src/sync`, `hub-server`, `data/sync`, or `apps/api` sync routes):

- [ ] No merge/resolution logic in hub or adapter code — domain only (`sync-hub-protocol` skill).
- [ ] No auto-resolution by wall-clock comparison; ordering uses `version` + push rejection.
- [ ] Delete-vs-edit conflicts route to their dedicated tab; tests assert they are never auto-resolved.
- [ ] Duplicate matching runs parents-first; phone normalization is E.164.
- [ ] Cursors and hub calls are scoped per `(deviceId, centreId)`.

If the PR touches center scoping (`Organization`, `Membership`, the switcher, DB open paths):

- [ ] No query, cache, key, or file path spans two `centreId`s (`multi-center-tenancy` skill).
- [ ] A negative test exists: membership in center A is rejected on center B.

Grep confirmation:

```bash
grep -R "DELETE FROM" apps/desktop/src/data/sqlite
grep -R "AUTOINCREMENT" apps/desktop/src/data/sqlite/migrations
grep -RE "new Date\(\)" packages/domain/src | grep -v tests   # Clock port only
grep -R "updated_at" packages/domain/src/sync | grep -iE "wins|compare|>"   # eyeball: no clock-based resolution
```

The first three should be empty; the fourth is a manual review aid.

---

## Gate 13 — Migration replay

```bash
pnpm migrate:reset && pnpm migrate:up
```

Runs all migrations against a fresh in-memory DB, then runs the E2E first-run spec. Catches migrations that pass in isolation but break the boot path.

---

## Gate 14 — Fresh-database E2E

```bash
pnpm test:e2e -- --grep "first-run"
```

The first-run spec creates a fresh temp DB, runs the setup wizard, logs in, and lands on the dashboard. If this fails, no one can install a new copy of the app. This is the single most important E2E.

---

## Gate 15 — Manual smoke of the packaged app

Launch the installer or the packaged binary from `out/`:

- App opens without a security warning (dev signing is on the roadmap; a warning is OK for now, an outright block is not).
- First-run wizard renders.
- Log in.
- Create one room, one teacher, one student, one group.
- Schedule one session.
- Generate the current month's invoices.
- Mark one as paid.
- Export it to PDF and open the PDF.
- Switch language to Arabic. Verify the layout mirrors.
- Restart the app. Verify the data is still there.

3 minutes, catches things the automated suite may not.

---

## Gate 16 — Self-review checklist

Run the full 22-point checklist from the `code-review` skill on your own diff. Paste the result in the PR description. Every box ticked, N/A, or commented.

---

## Gate 17 — Release notes / changelog

If the change is user-visible (new feature, changed behavior, plan-gating change):

- [ ] Added an entry to `CHANGELOG.md` under "Unreleased".
- [ ] Wrote a one-line French + one-line Arabic user-facing description.
- [ ] If the change affects pricing / plan feature comparisons, flag it so the landing page is updated in the same release.

---

## Gate 18 — CI green

Push the branch. The CI runs the same gates in the same order (`typecheck:domain → typecheck → lint → format → test → test:integration → build → test:e2e`). Wait for green before requesting review.

Do not request review with red CI, "it's just the flake". A red CI stays red.

---

## Order of operations if something fails

- **Gate 1** fails → open the file with the leaking import, restructure per `clean-architecture`. Do not proceed.
- **Gate 5–7** fails → fix the tests / code. Do not disable, do not skip.
- **Gate 8** fails intermittently → the fix is in your code, not in the test. See `e2e-testing`'s flake-hunt protocol.
- **Gate 9** fails → add translations. If AR is unknown, mark the string with a translation placeholder and open a translation ticket, but do not merge with empty AR.
- **Gate 11 or 12** fails → this is a *must* revert of the offending change. These are the two most expensive failure modes.

---

## When it's OK to skip a gate

Almost never. The only legitimate skip is:

- The change is a **documentation-only** commit (README, CLAUDE.md, `docs/`) — skip Gates 5–8, still run 1–4 to catch broken links or lint on `.md`.
- The change is a **chore: format** commit produced by `pnpm format` — skip 5–8, still run 1–4.

Every other case runs the whole gate.

---

## After merge

- Watch `main` CI go green.
- Verify the first packaged build (nightly or on-tag) runs through the fresh-DB path.
- If a bug slips through that any of these gates should have caught, update the corresponding skill so it can't happen again. The gates are the memory of past mistakes.
