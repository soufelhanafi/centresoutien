---
name: solid-coding
description: Apply SOLID principles and clean-code discipline to any TypeScript/React code written in this Next.js repo. Use this skill whenever writing a new component, refactoring an existing one, adding a hook, defining a type, splitting a file, or reviewing code — even if the user does not explicitly say "SOLID". Trigger on phrases like "add a component", "refactor", "clean up", "split this", "extract a hook", "review my code", or any pull-request review activity. This skill is the default coding standard for the repo — err on the side of triggering.
---

# SOLID Coding Skill

This skill defines how code is written in this repo. It is not a lecture on OOP — it is a procedure for making concrete decisions when writing or changing TypeScript and React code for the Centre Soutien Next.js landing page.

Follow the procedure top-to-bottom on any coding task. Skip nothing.

---

## Step 1 — Restate the goal in one sentence

Before writing code, write one sentence that answers: *what changes and why?* If the sentence has "and" in it more than once, the task is too large — split it into smaller tasks and do them one at a time.

Example — good:
> Add a `<PricingCard />` component that renders one tier from the pricing data.

Example — bad (too many concerns):
> Add pricing cards *and* the section wrapper *and* the CTA button variant *and* wire up analytics.

---

## Step 2 — Apply the SOLID gates

For every component, hook, or module, check each letter. If the answer to any gate is "no", stop and restructure before writing more code.

### S — Single Responsibility

Ask: *if this file changes, what's the reason?* There should be exactly one answer.

- A component renders one thing. `<PricingCard />` renders one pricing tier. `<PricingSection />` composes three cards plus a heading. These are two files, not one.
- A hook does one thing. `useFormValidation()` validates. `useSubmitFounderForm()` submits. Do not merge them.
- A utility does one thing. `formatMAD()` formats money. `parseMAD()` parses it. Two exports, not one dual-purpose function.

**Red flag:** component name needs "and" to describe it (`<PricingCardAndCTA />`). Split.
**Red flag:** file exceeds ~200 lines. Consider splitting.
**Red flag:** a component takes a `mode` or `variant` prop that changes what it *renders entirely* (not just styling). That's two components pretending to be one.

### O — Open/Closed

Ask: *if a new variant is needed, do I have to edit this file or can I extend it?*

- Add new visual variants via `cva()` (class-variance-authority) or shadcn's `variants` object. Do not fork the component.
- Add new behavior via composition (wrap the component) or via props (pass a render prop or slot). Do not add another `if` branch inside.
- If a `<Button />` needs a "download" variant with an icon, add it to `buttonVariants`. Do not create `<DownloadButton />` that copies `<Button />`.

**Red flag:** a chain of `if (variant === "x")` inside a component. Convert to a lookup table or `cva`.
**Red flag:** copy-pasted component files with 90% overlap. Extract the shared shell and pass differences as props.

### L — Liskov Substitution

Ask: *can every variant of this component be swapped for another without breaking the caller?*

- `<Button variant="ghost">` must accept the same props as `<Button variant="primary">`. No "ghost buttons don't support icons" surprises.
- If `<Input type="text">` supports an `onChange` handler, `<Input type="number">` must too, with a compatible signature.
- Server Component and Client Component versions of the same thing must have the same public prop shape. If they can't, name them differently (`<PricingCardServer />` vs `<PricingCardInteractive />`) so the substitution isn't implied.

**Red flag:** a variant that ignores or requires props the others don't. Reconsider whether it's really the same component.

### I — Interface Segregation

Ask: *does anything importing this need every prop it exposes?*

- Prop interfaces stay small and focused. Prefer three named props over one `config` object.
- Split fat prop types. `PricingCardProps` splits into `PricingCardDataProps` (tier, price, features) and `PricingCardStyleProps` (highlighted, size) if callers use them separately.
- Never take a "kitchen sink" prop like `options: Record<string, unknown>`.

**Red flag:** the prop type has more than 6–7 fields. Consider splitting or grouping.
**Red flag:** callers always pass `undefined` or default values for half the props. Those props probably don't belong on this component.

### D — Dependency Inversion

Ask: *does this depend on a concrete data source, or on a type?*

- Components take data as props (typed), not by calling `fetch()` or reading from a global store.
- Business logic depends on interfaces defined in `lib/types/`, not on Prisma models, API response shapes, or DB rows.
- Server Components fetch data at the boundary; child components take the typed result as a prop.

**Red flag:** a leaf component imports a data client (`db`, `fetch`, `next-intl` messages by key). Lift the dependency up.
**Red flag:** the same component behaves differently in dev vs prod because it reaches for environment-specific globals. Inject them.

---

## Step 3 — Apply the supporting principles

SOLID is the frame. These are the day-to-day habits.

### DRY, but with a threshold

Extract a shared helper when there are **three** copies with the same intent, not two. Two copies can drift for legitimate reasons; three usually can't.

Never extract just to reduce line count. Extract to give a concept a name.

### KISS

A `<section>` with Tailwind classes beats a "reusable section engine" every time on a landing page. When in doubt, choose the boring solution.

### YAGNI

Do not add abstractions, config options, or generic types for imagined future needs. Add them when the second use case actually appears.

### Colocation

For a component `Hero`:
```
components/sections/hero/
├── hero.tsx           # the component
├── hero.test.tsx      # its test (if any)
├── hero.types.ts      # its types (only if they don't fit in hero.tsx)
└── index.ts           # barrel: export { Hero } from './hero'
```

If a helper is used only by `Hero`, it lives in `hero/`. It graduates to `lib/` only when a second consumer appears.

### Explicit over clever

- `getFormattedPriceInMAD(cents)` beats `fmt(c)`.
- `if (tier.isRecommended)` beats `if (t.r)`.
- Cleverness costs the next reader (usually you, in three weeks).

### No prop drilling past 2 levels

If a prop is threaded through 3+ components untouched, either:
1. Lift the consumer up so the prop is passed directly, or
2. Move the state into context (only if it's truly cross-cutting like theme or locale).

Context is a last resort, not a first tool.

---

## Step 4 — Server Components by default

Every `'use client'` directive is a bundle cost. Justify each one.

- Server Component by default.
- Add `'use client'` only when the component needs: `useState`, `useEffect`, event handlers, browser APIs, or `useContext`.
- If only part of a section needs interactivity, split: keep the section as a Server Component and extract the interactive island as a Client Component.

Example:
- `<Pricing />` — Server Component, renders the layout and static content.
- `<PricingCard />` — Server Component, takes tier data as a prop.
- `<PricingTierToggle />` — Client Component, handles the monthly/yearly toggle.

**Red flag:** `'use client'` on a top-level section component that only has one interactive child. Push the boundary down.

---

## Step 5 — TypeScript discipline

- `strict: true`, `noUncheckedIndexedAccess: true` are non-negotiable.
- No `any`. If you truly need an escape hatch, use `unknown` and narrow with a type guard.
- No `@ts-ignore` or `@ts-expect-error` without a comment explaining exactly why.
- Prefer `type` over `interface` for props. Reserve `interface` for shapes explicitly meant to be extended.
- Types near the code that uses them. Global types only for truly shared shapes (`Locale`, `Testimonial`, `PricingTier`).
- Discriminated unions for state that has mutually exclusive shapes (form state: `"idle" | "submitting" | "success" | "error"`).
- `readonly` on arrays and object properties when the consumer shouldn't mutate them. Which is almost always.

---

## Step 6 — Naming

- **Components:** PascalCase, noun or noun phrase. `<PricingCard />`, `<FounderForm />`.
- **Hooks:** camelCase, start with `use`. `useFormValidation()`, `useLocale()`.
- **Utilities:** camelCase, verb phrase. `formatMAD()`, `parseMAD()`, `getStructuredData()`.
- **Types:** PascalCase, noun. `PricingTier`, `Testimonial`, `Locale`.
- **Booleans:** start with `is`, `has`, `should`, `can`. `isRecommended`, `hasDiscount`, `shouldShowFounderBadge`.
- **Event handlers:** `onXxx` for props, `handleXxx` for the implementation. `onSubmit` prop, `handleSubmit` implementation.

---

## Step 7 — Before finishing

Run through this checklist before considering the task done:

- [ ] The task's one-sentence goal from Step 1 is achieved, no more, no less.
- [ ] Every SOLID gate in Step 2 passes.
- [ ] No `'use client'` was added without a justification.
- [ ] All user-facing strings go through `next-intl`. No hardcoded strings.
- [ ] No directional Tailwind classes (`pl-*`, `pr-*`, `ml-*`, `mr-*`, `text-left`, `text-right`). Use logical properties.
- [ ] No `any`, no unexplained `@ts-ignore`.
- [ ] `pnpm lint && pnpm typecheck` pass locally.
- [ ] If the touched file exceeds ~200 lines, ask whether it should be split.
- [ ] The PR description explains what changed, why, and — if performance-sensitive — a Lighthouse before/after.

---

## Anti-patterns to reject on sight

If you catch yourself writing any of these, stop and restructure:

- **God components.** One component doing header layout, hero content, and form submission. Split.
- **Boolean prop soup.** `<Card isPrimary isHighlighted isDisabled isLoading isCompact />`. Use a `variant` prop with a discriminated union.
- **Deeply nested ternaries in JSX.** Extract to a helper or use a `switch` in a `useMemo`.
- **Fetching in leaf components.** Fetch at the section (or page) level, pass down as props.
- **useEffect for everything.** If it's derived from props, compute it directly. If it's server state, fetch in a Server Component. `useEffect` is for genuine side effects only.
- **Silent failure.** No `catch (e) {}`. Either handle it, log it, or let it throw.
- **Magic numbers and strings.** `if (tier === "pro")` → `if (tier === PRICING_TIERS.PRO)`. Centralize in a constants file if used more than once.
- **Comments that explain what.** Code should say what. Comments explain *why* when it's non-obvious.

---

## When SOLID conflicts with pragmatism

Ship, then refactor. If enforcing every principle would delay a fix or block a demo, note the debt with a `// TODO(solid):` comment describing what should change and why, and open an issue. Do not carry perfectionism further than the situation warrants — but do not silently accumulate mess either.
