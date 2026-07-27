---
name: pre-merge-check
description: Run the final gate before merging any PR in the Centre Soutien Next.js repo. Use this skill whenever the user says "ready to merge", "final check", "before I ship this", "PR review", or manually invokes a merge check. Also trigger automatically at the end of any coding task before declaring it done — this skill is the last line of defense against regressions. Fails loud on any of: lint, typecheck, build, tests, Lighthouse budget, unjustified `'use client'`, directional Tailwind classes, missing i18n keys, missing SEO metadata, or accidental PII logging.
---

# Pre-Merge Check Skill

This is the last gate before code hits `main`. Every check must pass. If any check fails, do not merge — fix it or open a discussion in the PR.

Run the checks in order. Do not skip. Do not run them in parallel — one at a time so failures are easy to attribute.

---

## Check 1 — Lint

```bash
pnpm lint
```

- **Must return zero errors and zero warnings.**
- Common failures: unused imports, missing `React` key on lists, `console.log` left in.
- Fix each one before continuing. Do not disable rules to pass the gate.

---

## Check 2 — Typecheck

```bash
pnpm typecheck
```

- Must return zero errors.
- No new `any` types introduced.
- No new `@ts-ignore` or `@ts-expect-error` without a comment explaining exactly why.
- If typescript errors involve i18n message keys, the JSON files are out of sync — go to Check 3.

---

## Check 3 — i18n sync

Verify the message files have identical key structure:

```bash
# Extract all keys from both files
jq -r 'paths(scalars) | join(".")' i18n/messages/fr.json | sort > /tmp/fr-keys.txt
jq -r 'paths(scalars) | join(".")' i18n/messages/ar.json | sort > /tmp/ar-keys.txt
diff /tmp/fr-keys.txt /tmp/ar-keys.txt
```

- **Diff must be empty.** Every key in FR must exist in AR and vice versa.
- If it's not empty: either add the missing keys, or if the addition was accidental, remove them.
- Never ship with a key mismatch — the missing-locale side will render key names or crash.

---

## Check 4 — Directional Tailwind classes

Scan the entire diff for banned directional classes:

```bash
git diff origin/main --unified=0 -- '*.tsx' '*.ts' \
  | grep -E '^\+' \
  | grep -vE '^\+\+\+' \
  | grep -nE '\b(pl-|pr-|ml-|mr-|border-l|border-r|rounded-l|rounded-r|space-x-)[0-9a-z]+|text-(left|right)\b|\b(left-|right-)[0-9]+'
```

- **Zero matches allowed** outside of `components/ui/` (shadcn primitives may contain these — that's OK because shadcn handles RTL internally).
- If matches are found in `components/sections/`, `components/common/`, or `app/`: replace with logical properties (`ps-`, `pe-`, `ms-`, `me-`, `text-start`, `text-end`, `start-`, `end-`, `border-s`, `border-e`, `rounded-s`, `rounded-e`, `gap-`).

---

## Check 5 — Unjustified `'use client'`

Find every `'use client'` added in this PR:

```bash
git diff origin/main --unified=0 -- '*.tsx' \
  | grep -B1 "'use client'" \
  | grep -E '^\+\+\+'
```

For each file listed:
- Verify the PR description explains why the file needs to be a Client Component.
- Verify the component actually uses `useState`, `useEffect`, event handlers, or browser APIs. If it doesn't, remove the `'use client'` directive.
- Verify the boundary is at the smallest possible component. If a section is a Client Component and only one child needs interactivity, refactor to push the boundary down.

**Every `'use client'` costs bundle size on the landing page. Justify each one in the PR description.**

---

## Check 6 — Hardcoded strings

Grep for any string that looks like user-facing text in TSX files:

```bash
# French words that shouldn't appear outside JSON
git diff origin/main --unified=0 -- '*.tsx' \
  | grep -E '^\+' \
  | grep -vE 'className|import|from|const|let|var|function|export|return|type|interface'  \
  | grep -iE 'télécharger|essayer|découvrir|voir|contacter|inscription|centres|soutien|scolaire'

# Arabic characters in TSX files (they belong in ar.json only)
git diff origin/main --unified=0 -- '*.tsx' \
  | grep -E '^\+' \
  | grep -P '[\x{0600}-\x{06FF}]'
```

- **Any match is a failure.** All user-facing strings must go through `next-intl`.
- Exceptions: comments, JSDoc, `@ts-expect-error` messages, error messages that are only logged server-side.

---

## Check 7 — SEO metadata on new or changed pages

For each page file changed in this PR:

```bash
git diff --name-only origin/main | grep 'app/.*page\.tsx'
```

For each page:
- [ ] Has `export const metadata` or `generateMetadata`.
- [ ] Has `title` (30–60 chars).
- [ ] Has `description` (120–160 chars).
- [ ] Has `openGraph.images`.
- [ ] Has `alternates.canonical` (absolute URL, no trailing slash).
- [ ] Has `alternates.languages` with both `fr-MA` and `ar-MA`.

If a page was added: run the full `seo-audit` skill before considering this check passed.

---

## Check 8 — Founder form changes require extra scrutiny

If the PR touches any of:
- `components/sections/founder-program.tsx`
- `app/api/founder/`
- `lib/validators.ts` (specifically the Founder schema)
- Any migration or DB schema for founder submissions

Then run the `founder-form-changes` skill checks before proceeding. Personal data flow changes are the highest-risk changes in this repo — do not merge without a specific PII review.

---

## Check 9 — Build

```bash
pnpm build
```

- **Must complete with zero errors and zero new warnings.**
- Review the route report at the end of the build. If any route unexpectedly went from static (`○` or `●`) to dynamic (`ƒ`), investigate — this often signals accidental dynamic imports or a Server Component that started depending on request-time data.
- Check the bundle size report. Initial JS should still be under 90 kB gzipped.

---

## Check 10 — Tests

```bash
pnpm test          # Vitest unit + component
pnpm test:e2e      # Playwright critical paths (may be slower — run at least once)
```

- **All tests must pass.**
- If a test was skipped in this PR, verify why in the PR description.
- If a test was deleted, verify it was replaced (usually) or that the deleted coverage was intentional (rarely).

---

## Check 11 — Lighthouse

```bash
pnpm start &
pnpm lhci --collect.url=http://localhost:3000/fr/ --collect.url=http://localhost:3000/ar/
```

Enforced thresholds:

| Metric | Target |
|---|---|
| Performance | ≥ 95 |
| SEO | 100 |
| Accessibility | ≥ 95 |
| Best Practices | ≥ 95 |
| LCP | < 2.0s |
| CLS | < 0.05 |
| INP | < 150ms |
| Initial JS bundle | < 90 kB gzipped |

- If any threshold fails, do not merge.
- If a metric regressed compared to `main` but is still above threshold: note it in the PR description and get sign-off.

---

## Check 12 — Visual smoke test in both locales

Manual, but non-negotiable:

- [ ] Open http://localhost:3000/fr/ — scroll from top to bottom. Nothing broken.
- [ ] Open http://localhost:3000/ar/ — scroll from top to bottom. Layout mirrors correctly.
- [ ] Toggle between FR and AR using the header switcher. State preserved (scroll position may reset — that's OK).
- [ ] Open the Founder form. Tab through with keyboard only. Every field is reachable and focus-visible.
- [ ] Open on a mobile viewport (390px). No horizontal overflow.

---

## Check 13 — Nothing sensitive in the diff

```bash
# Nothing should match
git diff origin/main | grep -iE 'password|secret|token|api[_-]?key|bearer\s'
git diff origin/main | grep -E '[A-Za-z0-9+/]{40,}={0,3}'   # base64-looking blobs
```

- No credentials committed.
- No hardcoded emails or phone numbers that should be in config.
- No `.env` file changes without a corresponding `.env.example` update.

---

## Check 14 — PR description sanity

The PR description must include:

- [ ] What changed (one paragraph).
- [ ] Why (link to the issue or design decision).
- [ ] Screenshots of any visual change, in both locales.
- [ ] Lighthouse before/after if the change touches the critical rendering path.
- [ ] Any `'use client'` justifications.

If any of these are missing, ask for them before merging.

---

## Final decision

If all 14 checks pass: safe to merge.

If any check fails:
1. Stop.
2. Report exactly which check failed and why.
3. Fix the issue.
4. Re-run from Check 1.

Do not merge with any check failing. Do not partially merge. Do not skip a check "just this once".

---

## What this skill guarantees

If you run every step and every step passes, the following classes of bugs will not ship:

- Broken RTL layout
- Missing translations
- SEO score drops
- Performance regressions past the budget
- TypeScript errors that snuck through CI
- Accidental credential commits
- Client-side bloat from unjustified `'use client'`
- PII exposure through the Founder form path

If a bug in any of these classes reaches production, this skill needs to be updated to catch it — retrospect and add the missing check.
