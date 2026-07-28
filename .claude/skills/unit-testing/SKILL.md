---
name: unit-testing
description: Write, structure, and maintain Vitest unit tests for the Centre Soutien Electron repo with a strong bias toward the Domain layer. Use this skill whenever adding or editing a use case, policy, entity, value object, hook, pure function, or Zustand store; whenever fixing a bug in domain code (write the regression test first); whenever refactoring; and whenever a PR touches business logic without accompanying tests. Trigger on phrases like "write a test", "unit test", "vitest", "coverage", "regression test", "fix this bug" (in domain), "TDD", "test-first", or any change to `packages/domain/src/`. Err on the side of triggering — an untested domain change is a broken invariant waiting to happen.
---

# Unit Testing — Centre Soutien Desktop

The domain layer is portable, so its tests are portable too — they run against pure TypeScript with in-memory fakes and never touch SQLite, Electron, or the filesystem. That makes them fast, deterministic, and trustworthy. Keep them that way.

---

## Step 1 — Pick the right kind of test for what you're changing

| Change | Test kind | Location |
|---|---|---|
| Domain use case, policy, entity, value object | Unit | `tests/unit/domain/...` |
| Zustand store slice | Unit | `tests/unit/renderer/stores/` |
| Pure utility (formatters, id generation, natural-key normalizer) | Unit | `tests/unit/{domain,renderer}/lib/` |
| React component behavior (form validation, conditional rendering) | Unit (React Testing Library) | `tests/unit/renderer/components/` |
| SQLite repository against `:memory:` | Integration | `tests/integration/data/` |
| Excel round-trip | Integration | `tests/integration/data/` |
| PDF byte-level output | Integration | `tests/integration/data/` |
| End-user flow (first-run, login, create student, generate invoice) | E2E | `tests/e2e/` — see `e2e-testing` |

If it touches infrastructure, it is not a unit test. Move it to integration.

---

## Step 2 — Structure every unit test the same way

File names mirror the source: `packages/domain/src/use-cases/create-parent.ts` → `tests/unit/domain/use-cases/create-parent.test.ts`.

Every test file uses the AAA layout: **Arrange → Act → Assert**, one behavior per `it`, one clear reason to fail.

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CreateParent } from '~/domain/use-cases/create-parent';
import { InMemoryParentRepository } from '../fakes/in-memory-parent-repository';
import { fakeClock, fakeIds, fakePlan } from '../fakes';
import { ParentAlreadyExistsError } from '~/domain/errors/parent-errors';

describe('CreateParent', () => {
  let parents: InMemoryParentRepository;
  let useCase: CreateParent;

  beforeEach(() => {
    parents = new InMemoryParentRepository();
    useCase = new CreateParent(parents, fakeClock('2026-07-28T10:00:00Z'), fakeIds(), fakePlan('pro'));
  });

  describe('happy path', () => {
    it('creates a parent with normalized natural key and timestamps', async () => {
      const parent = await useCase.execute({
        centerCode: 'CS-CASA-001',
        fullName: '  Ahmed  BENALI ',
        phone: '+212600000000',
        relationship: 'father',
      });

      expect(parent.id).toMatch(/^prt_/);
      expect(parent.naturalKey).toBe('CS-CASA-001::ahmed-benali::+212600000000');
      expect(parent.createdAt).toEqual(new Date('2026-07-28T10:00:00Z'));
      expect(parent.updatedAt).toEqual(parent.createdAt);
      expect(parent.deletedAt).toBeNull();
      expect(await parents.findById(parent.id)).toEqual(parent);
    });
  });

  describe('plan gating', () => {
    it('throws PlanFeatureUnavailableError when plan lacks core.parents', async () => {
      useCase = new CreateParent(parents, fakeClock(), fakeIds(), fakePlan('essentiel'));
      await expect(useCase.execute(validInput())).rejects.toThrow('PlanFeatureUnavailableError');
    });
  });

  describe('duplicate detection', () => {
    it('rejects when a parent with the same natural key already exists', async () => {
      await useCase.execute(validInput());
      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(ParentAlreadyExistsError);
    });

    it('permits recreating a soft-deleted parent with the same natural key', async () => {
      const first = await useCase.execute(validInput());
      await parents.softDelete(first.id, new Date());
      const second = await useCase.execute(validInput());
      expect(second.id).not.toBe(first.id);
    });
  });
});
```

Every use case needs at minimum these test groups: **happy path**, **plan gating** (if the use case checks a feature), **limit exceeded** (if it enforces a limit), **validation errors**, **duplicate / conflict** (if applicable), **idempotency / safe replay**.

---

## Step 3 — Use in-memory fakes, not mocks

Fakes are simpler and safer than mocks. They implement the port with a `Map` or an array, and they behave like the real thing.

Fakes live in `tests/unit/domain/fakes/`. One per port.

```ts
// tests/unit/domain/fakes/in-memory-parent-repository.ts
import type { ParentRepository } from '~/domain/ports/parent-repository';
import type { Parent } from '~/domain/entities/parent';

export class InMemoryParentRepository implements ParentRepository {
  private readonly rows = new Map<string, Parent>();

  async save(parent: Parent): Promise<void> {
    this.rows.set(parent.id, structuredClone(parent));
  }
  async findById(id: ParentId): Promise<Parent | null> {
    return this.rows.get(id) ?? null;
  }
  async findByNaturalKey(nk: string): Promise<Parent | null> {
    for (const p of this.rows.values()) if (p.naturalKey === nk) return p;
    return null;
  }
  async findByStudentId(_: StudentId): Promise<readonly Parent[]> {
    /* ... */ return [];
  }

  // test-only convenience
  softDelete(id: ParentId, at: Date) { /* ... */ }
  all(): readonly Parent[] { return [...this.rows.values()]; }
}
```

Rules for fakes:

- Implement the port completely.
- Use `structuredClone` on save so callers can't mutate stored data.
- Match error semantics of the real adapter (throw the same domain errors).
- Extra test-only helpers (`all()`, `seed()`) are fine, marked distinctly.

Do **not** use `vi.mock()` on the port. Injection is cleaner and less brittle.

---

## Step 4 — Determinism — fake time, fake IDs, fake randomness

Any use case that reads the current time or generates IDs must receive a `Clock` and `IdGenerator` port. In tests, use fakes:

```ts
// tests/unit/domain/fakes/clock.ts
export function fakeClock(iso = '2026-07-28T10:00:00Z') {
  let now = new Date(iso);
  return {
    now: () => now,
    advance: (ms: number) => { now = new Date(now.getTime() + ms); },
  };
}
```

```ts
// tests/unit/domain/fakes/ids.ts
export function fakeIds(seed = 1) {
  let n = seed;
  return {
    newParentId: () => `prt_${String(n++).padStart(6, '0')}` as ParentId,
    newStudentId: () => `stu_${String(n++).padStart(6, '0')}` as StudentId,
    // ...
  };
}
```

A test that reads `new Date()` inside the code under test — or uses `Math.random` — is flaky by construction. Reject it.

---

## Step 5 — Table-driven tests for policies

Business policies (invoice math, discount rules, conflict detection) are best expressed as tables.

```ts
describe('InvoiceLineMath.applyDiscount', () => {
  const cases = [
    { name: 'no discount', base: 500, discount: { type: 'none' }, expected: 500 },
    { name: '10% off', base: 500, discount: { type: 'percentage', value: 10 }, expected: 450 },
    { name: 'percentage capped at 100', base: 500, discount: { type: 'percentage', value: 150 }, expected: 0 },
    { name: 'fixed amount', base: 500, discount: { type: 'fixed', value: 75 }, expected: 425 },
    { name: 'fixed amount cannot go negative', base: 500, discount: { type: 'fixed', value: 900 }, expected: 0 },
  ] as const;

  it.each(cases)('$name', ({ base, discount, expected }) => {
    expect(applyDiscount(base, discount)).toBe(expected);
  });
});
```

Add cases as bugs are found. Regression tests are cheap in this pattern.

---

## Step 6 — Testing React components

Use `@testing-library/react` and query by role / label, never by test-id unless there is no accessible name (in which case, fix the component first).

- Test behavior visible to a user (a submit disables while pending), not implementation (state variable was set).
- Wrap in the same providers the real app uses (i18n, QueryClient, Theme). Provide a `renderWithProviders` helper in `tests/unit/renderer/test-utils.tsx`.
- Never test that a specific class name is present. Test the outcome.
- For i18n-sensitive tests, render once in FR and once in AR to catch key/direction bugs.

```tsx
it('disables submit while the mutation is pending', async () => {
  renderWithProviders(<StudentForm onSaved={vi.fn()} />);
  await userEvent.type(screen.getByLabelText(/nom complet/i), 'Ahmed Benali');
  await userEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
  expect(screen.getByRole('button', { name: /enregistrer/i })).toBeDisabled();
});
```

---

## Step 7 — Coverage requirements

- **Domain** (`packages/domain/src/`): **≥ 90%** lines and branches. Enforced in CI. If your PR drops it, add tests.
- **Renderer** (`apps/desktop/src/renderer/`): no floor, but no regression against `main`. Coverage is measured and reported.
- **Data** (`apps/desktop/src/data/`): covered mostly by integration tests, not unit tests.

Coverage is a floor, not a ceiling. 100% coverage on a bad test is worse than 60% on a good one. Reviewers look at what is tested, not just how much.

---

## Step 8 — What NOT to test

Do not write tests that assert:

- The signature of a function (TypeScript already does).
- That a mock was called with specific arguments **and** returned a specific value (that tests the mock, not the code).
- Third-party library behavior.
- CSS class names.
- Auto-generated types.

Delete tests that only exist to reach a coverage number. They lie.

---

## Step 9 — Bug-fix protocol

When fixing a bug in domain code:

1. First, write the failing test that reproduces the bug. Commit it as its own commit: `test: add regression for XYZ`.
2. Then fix the code. Commit as `fix: XYZ`.
3. The reviewer must see that the test fails at commit 1 and passes at commit 2.

This is non-negotiable for domain bugs.

---

## Step 10 — Running tests

```bash
pnpm test                     # all unit tests, watch mode locally
pnpm test:run                 # single run, used in CI
pnpm test -- --coverage       # with coverage
pnpm test path/to/file.test.ts   # single file
pnpm vitest -t "duplicate detection"  # filter by name
```

Tests must pass in isolation and in random order. `pnpm test:run --sequence.shuffle` is run periodically in CI to catch order dependencies.

---

## Common failure modes and their fix

| Symptom | Diagnosis | Fix |
|---|---|---|
| Test passes locally, fails in CI. | Time or randomness bleeds in. | Inject `Clock`, `IdGenerator`. |
| Test file over 500 lines. | System under test is too broad. | Split the use case; split the tests. |
| Test asserts internals (private field). | Test wrote itself to the code, not the contract. | Rewrite to assert observable behavior. |
| Test uses `vi.mock('~/domain/...')`. | Fighting the injection design. | Inject a fake through the constructor instead. |
| `expect(...).toBeCalledWith(anything)`. | Test asserts nothing meaningful. | Assert the outcome (repository state, returned value), not the call. |
| Test needs `sleep` to pass. | Race condition in the code. | Fix the code, not the test. |
