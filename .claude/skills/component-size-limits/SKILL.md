---
name: component-size-limits
description: Enforce concrete size ceilings on files, functions, components, hooks, and use cases in the Centre Soutien Electron repo. Use this skill whenever adding a new file, editing an existing file that is already close to a ceiling, extracting a component or hook, refactoring, reviewing a diff, or resolving a "this file has grown too large" comment. Trigger on phrases like "add a component", "large component", "getting too big", "split this", "extract", "refactor", "clean up", "cyclomatic complexity", or any addition to a file already over 150 lines. Err on the side of triggering — creeping file growth is one of the most common ways this codebase's quality can silently degrade.
---

# Component & File Size Limits

Software rots by accretion. This skill sets concrete numbers so we can catch it early instead of arguing about it later.

---

## The ceilings

| Artifact | Soft ceiling (warn) | Hard ceiling (reject) |
|---|---|---|
| Any source file | 150 lines | 200 lines |
| Any function / method | 30 lines | 40 lines |
| Any React component (JSX + logic, one file) | 150 lines | 200 lines |
| Any hook | 60 lines | 80 lines |
| Any use case class | 80 lines | 120 lines |
| Any test file | 300 lines | 500 lines |
| Any i18n JSON | no line limit | no line limit |
| Props on one component | 6 | 8 |
| Parameters on one function | 3 | 5 (use an options object beyond this) |
| Cyclomatic complexity | 8 | 10 |
| Cognitive complexity (SonarSource metric) | 15 | 20 |
| `useState` calls in one component | 3 | 5 |
| Nested ternaries | 1 | 2 |
| Levels of indentation | 3 | 4 |

Blank lines and imports count against the file line count. Comments do not.

Test files get a higher ceiling because table-driven tests inflate line counts without hurting readability. But if a test file crosses 500 lines, the *system under test* is probably too large.

---

## Step 1 — Before editing, check the current size

`wc -l <file>` before adding to a file. If the file is already at or over the soft ceiling, do not add to it — split first.

If the change is a one-line fix in a file already over the hard ceiling, add the fix, then in the same commit split the file. The reviewer will not accept "I'll split it in a follow-up".

---

## Step 2 — How to split a React component

A component is too large when either:

- It exceeds the ceiling in lines.
- It has more than 3 clearly separable responsibilities inside its JSX (header + list + footer + drawer, for instance).
- It reads props into local state and mutates them.
- Its JSX has more than 3 nesting levels of conditionals.

### The extraction ladder — try in order

1. **Extract child components**. If the top-level `return` has a header, a body, and a footer, they become `<Header />`, `<Body />`, `<Footer />`. Colocate them in the same folder unless reused.
2. **Extract a hook**. All `useState` + `useEffect` + derived values move into `use<ComponentName>State()`. The component becomes render-only.
3. **Extract handlers**. `handleSubmit`, `handleDelete`, etc., become named functions inside the hook, exposed on its return.
4. **Extract subtree memoization**. If a section is expensive and rarely changes, `React.memo` a child rather than trying to memoize inside a giant component.
5. **Extract to a Zustand slice**. If the same state is read in three sibling components, it does not belong as prop-drilled `useState` — it goes in a store slice.

### The extraction ladder — how it looks

Before (245 lines, over hard ceiling):

```tsx
export function StudentDrawer({ studentId }: Props) {
  // 40 lines of state
  // 60 lines of handlers
  // 20 lines of derived values
  return (
    <Sheet>
      // 120 lines of JSX with 4 tabs
    </Sheet>
  );
}
```

After (component is 40 lines):

```
student-drawer/
├── student-drawer.tsx           # composition, 40 lines
├── use-student-drawer.ts        # state + handlers, 80 lines
├── student-drawer-header.tsx    # 30 lines
├── student-drawer-fiche-tab.tsx # 60 lines
├── student-drawer-schedule-tab.tsx
├── student-drawer-parents-tab.tsx
└── student-drawer-history-tab.tsx
```

Colocate. Do not scatter across `components/` and `hooks/`.

---

## Step 3 — How to split a use case

Use cases exceed the ceiling when they orchestrate multiple business decisions. The fix is almost always to extract a **policy**.

Before (`GenerateMonthlyInvoices` at 180 lines):

- 30 lines of loading data.
- 40 lines of computing per-line fees with discounts and edge cases.
- 30 lines of applying plan-locked partial-payment logic.
- 40 lines of writing invoices back.
- 40 lines of error handling and result reporting.

After:

- `GenerateMonthlyInvoices` (80 lines) — orchestration only.
- `InvoiceLineMath` policy (50 lines) — pure math, table-driven tests.
- `PartialPaymentPolicy` (30 lines) — plan-aware behavior around partial payments.
- Errors and result types live in `errors/` and `results/`.

Splitting a use case into policies usually gives you 3–5× the test coverage for free, because policies are trivially unit-testable.

---

## Step 4 — How to split a hook

Hooks exceed the ceiling when they mix concerns.

Common signal: the hook returns an object with more than 6 keys of unrelated data (form state, network state, derived selectors, and unrelated side effects).

Fix: split into orthogonal hooks and let the component compose them.

```ts
// Before:
useStudentPage(id) → { student, isLoading, form, saveDraft, publish, invoices, ... }

// After:
useStudent(id)       → { student, isLoading }
useStudentForm(...)  → { form, saveDraft, publish }
useStudentInvoices() → { invoices, isLoadingInvoices }
```

---

## Step 5 — Reduce complexity, not just lines

Line count is a proxy. The underlying goal is low **cognitive complexity**. Rules of thumb:

- Replace nested `if`s with early returns.
- Replace ternary chains with a `switch` on a discriminated union, or a lookup table.
- Extract predicates: `if (isEligibleForPartialPayment(invoice, plan))` reads better than 4 inline conditions.
- Replace `boolean` combinations with a discriminated union (`type Status = 'draft' | 'paid' | 'partially-paid' | 'cancelled'`, not `{ isDraft, isPaid, isPartial, isCancelled }`).
- Return early on validation failures — no `if (valid) { …huge nested block… }`.

---

## Step 6 — Enforcement

The following are enforced in CI:

- ESLint `max-lines`, `max-lines-per-function`, `max-params`, `complexity`, `max-depth`, `max-nested-callbacks`.
- SonarQube (the previous project already had a config) — cognitive complexity + duplication rate.
- A pre-commit hook (Husky + lint-staged) runs the same rules on staged files.

If ESLint says a file is over the ceiling and you disable the rule with a comment to ship the change, the reviewer must reject the PR.

The only allowed suppression is on generated code (`i18n/*.json` translated files, `migrations/*.sql`).

---

## Step 7 — Grandfathering

Files inherited from before these rules or added before this skill existed may exceed the ceilings. That is not a green light to *add* to them. Any change that touches such a file must, at minimum, not make it larger. If you can bring it below the ceiling in your commit without ballooning the diff, do so.

---

## Common excuses and their answers

| "But…" | Answer |
|---|---|
| "It's cohesive, it belongs together." | Cohesion is preserved by colocating files in a folder, not by cramming them into one file. |
| "Splitting adds indirection." | Indirection at layer boundaries is the *point*. Indirection inside one layer (a hook and its component) is nearly free. |
| "The extracted piece has one caller, YAGNI." | YAGNI is about *features*, not readability. Extracting for readability is always paid back. |
| "The reviewer will let it slide, it's just this once." | This is exactly how the previous codebase got a 900-line component. Do the split now. |
