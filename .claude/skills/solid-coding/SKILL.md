---
name: solid-coding
description: Apply SOLID principles and clean-code discipline to any TypeScript / React / Node code written in the Centre Soutien Electron repo. Use this skill whenever writing a new component, use case, hook, entity, policy, adapter, or module; whenever refactoring, splitting, or extracting existing code; whenever reviewing a diff; and whenever a change touches more than one file. Trigger on phrases like "add a component", "write a use case", "refactor", "clean up", "split this", "extract a hook", "review my code", "improve this", or any pull-request activity. This is the default coding standard for the whole repo — err on the side of triggering it, even on small edits.
---

# SOLID Coding — Centre Soutien Desktop

Not a lecture. A procedure. Follow it top-to-bottom every time you write or edit code.

---

## Step 1 — Restate the goal in one sentence

Before typing code, write a sentence that answers: *what changes and why?* If it contains "and" more than once, the task is too large. Split it and do the pieces one at a time.

Bad: "Add the parents tab to the student drawer and wire up the create-parent use case and add validation and translate the labels."

Good: three tasks — (a) add the create-parent use case with unit tests, (b) add the Parents tab UI, (c) add validation + i18n.

---

## Step 2 — Identify the layer

State which layer the change belongs to: **Presentation**, **Domain**, or **Data**. If the change touches more than one layer, split into ordered commits: **Domain first**, then Data adapters, then Presentation. This ordering guarantees each commit compiles and tests independently.

If unsure which layer something belongs in, ask: *does it depend on React, Electron, `fs`, or SQL?* Yes → not Domain. Only React or Electron renderer → Presentation. Only DB or filesystem → Data. Pure logic and types → Domain.

---

## Step 3 — Apply the SOLID gates

For every unit (component, hook, use case, policy, entity, repository, module), check each letter. If any answer is "no", stop and restructure before writing more code.

### S — Single Responsibility

Ask: *if this file changes, what's the reason?* There must be exactly one answer.

- A component renders one thing. `<StudentRow />` renders one row. `<StudentTable />` composes rows plus header. Two files, not one.
- A hook does one thing. `useStudentList()` fetches; `useCreateStudent()` mutates. Do not merge them.
- A use case does one thing. `CreateStudentUseCase.execute()` creates a student. Do not also generate their first invoice inside it — that is a separate use case that composes.
- A policy handles one rule family. `SessionConflictPolicy` checks conflicts. `PlanPolicy` checks plans. Never one class for both.

### O — Open / Closed

Extend, don't edit. Concretely in this repo:

- New UI variants → add a `cva` variant to the existing component, don't fork it.
- New conflict type → add a new detector to `SessionConflictPolicy`, don't `if/else` a growing switch.
- New plan feature → add a `FeatureFlag` to `plans.ts`, don't scatter `plan.id === 'pro'` checks.
- New invoice status → add to the discriminated union and handle it in the reducer, don't add a boolean.

### L — Liskov Substitution

Subtypes must honor the contract of their parent. In this repo it applies mostly to repository ports:

- `SqliteStudentRepository` and a future `HttpStudentRepository` must behave identically for the same call. Same errors, same idempotency, same soft-delete semantics.
- If a mock repository returns a shape the real one doesn't, tests lie. Match the real contract.

### I — Interface Segregation

Small ports. If a use case needs `findById` and `save`, its port has only `findById` and `save`. Do not depend on a fat `StudentRepository` that also does bulk export, unless you use bulk export.

In practice: define narrow ports at the use case's own doorstep and let the SQLite adapter implement several of them.

### D — Dependency Inversion

High-level modules depend on abstractions, not concretions.

- Use cases receive ports through the constructor. They **never** import `better-sqlite3`, `pdf-lib`, `fs`, `path`, `os`, or `exceljs`.
- Components receive data through hooks that call IPC. They **never** import from `apps/desktop/src/data/` or `apps/desktop/src/main/`.
- The only file allowed to wire concretes to abstractions is `apps/desktop/src/main/composition-root.ts`.

---

## Step 4 — Non-SOLID gates that matter just as much here

### KISS

If a use case can be written as one 20-line function, don't invent a class hierarchy. Classes are for state + dependencies. Pure logic is a function.

### DRY — with a three-strikes rule

Duplicate on the first occurrence. Duplicate on the second. Extract on the third. Premature DRY (extracting after one occurrence, when the two future callers don't exist yet) creates worse coupling than the duplication it avoided.

The exception: business rules (invoice math, conflict detection, plan gating) are DRY from strike one. They must have exactly one definition or they will drift.

### YAGNI

Do not add an option, prop, config field, or plan feature "in case we need it later". Add it when the task requires it. The plans system is deliberately additive precisely so we can add features later without paying for them now.

### Colocation

- Component tests next to the component.
- Use case tests mirror `packages/domain/src/` in `tests/unit/`.
- i18n strings go directly into `fr.json` and `ar.json` as part of the same commit — never "will translate later".

### TypeScript strictness

- No `any` in application code. Ever. Reviewer rejects on sight.
- Prefer `unknown` at boundaries and narrow with a Zod schema.
- Prefer discriminated unions over booleans for state (`Draft | Paid | PartiallyPaid | Cancelled`, not `isPaid: boolean`).
- Brand primitive IDs: `type StudentId = Brand<string, 'StudentId'>`. This alone prevents whole categories of bugs.
- Use `readonly` on collections passed across boundaries.

### Naming

- Use cases: verb phrase in PascalCase — `CreateStudent`, `GenerateMonthlyInvoices`, `ScheduleRecurringSession`.
- Ports: noun in PascalCase ending in `Repository` or `Service` — `StudentRepository`, `PdfRenderer`.
- Feature flags: dotted lowercase — `planning.random-auto`, `io.excel.sync`.
- Files: kebab-case for modules, PascalCase for React components.

---

## Step 5 — Anti-patterns to reject on sight

Reject these in your own code and in review:

- A `useEffect` that fires an IPC call in a component (use TanStack Query).
- A `useState` that mirrors a prop.
- A file over 200 lines (see `component-size-limits`).
- A function over 40 lines.
- A prop list over 7 items — the component wants to split.
- A cyclomatic complexity over 10 — extract.
- A comment that begins with "TODO" without an owner and a date.
- Commented-out code committed to main.
- A repository method that returns `any` or `unknown` without a schema-narrowing at the boundary.
- A component that imports from `apps/desktop/src/data/` or `apps/desktop/src/main/`.
- A use case that imports from `apps/desktop/src/renderer/` or `better-sqlite3`.
- A `plan.id === 'premium'` check anywhere except `plans.ts`.
- A `DELETE` in a SQL migration for a live table (soft delete only).
- A user-facing string that is not in `fr.json` and `ar.json`.
- A `pl-*` / `pr-*` / `ml-*` / `mr-*` Tailwind class (use logical properties).

---

## Step 6 — When you finish

Before opening the PR:

1. Read your diff top to bottom pretending you're a stranger.
2. If any file exceeds 200 lines or any function exceeds 40 lines, split.
3. If any file's imports cross a forbidden layer boundary, restructure.
4. Run `pnpm typecheck:domain && pnpm typecheck && pnpm lint && pnpm test`.
5. Hand off to the `code-review` skill for the final 22-point sweep.
