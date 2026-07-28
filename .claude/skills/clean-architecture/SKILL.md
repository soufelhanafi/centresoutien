---
name: clean-architecture
description: Enforce the strict Presentation / Domain / Data layered architecture that keeps the Centre Soutien codebase portable to a future web application. Use this skill whenever adding a new file, moving a file, adding a new use case, adding a new repository or adapter, wiring IPC handlers, importing across folders, or reviewing any diff that touches more than one of `apps/desktop/src/renderer/`, `packages/domain/src/`, `apps/desktop/src/data/`, or `apps/desktop/src/main/`. Trigger on phrases like "add a use case", "new entity", "new IPC handler", "new repository", "wire up", "port", "adapter", "composition root", or any change that could accidentally couple domain logic to Electron / React / SQLite. Err on the side of triggering — architectural drift is the single most expensive kind of mistake we can make in this repo.
---

# Clean Architecture — Centre Soutien Desktop

The whole point of this project's structure is that we can later reuse the domain and (mostly) the presentation on a web version without rewriting business logic. The repo is a pnpm-workspaces monorepo: `packages/domain` + `packages/ui` are shared; `apps/desktop`, and later `apps/api` + `apps/web`, are shells around them. One codebase for every plan and every platform — plans are configuration, platforms are adapters, and branches-per-plan are forbidden. That only works if the layers stay clean. This skill is the enforcement mechanism.

---

## The three layers, one paragraph each

**Presentation** (`apps/desktop/src/renderer/`, `apps/desktop/src/main/ipc/`, `apps/desktop/src/preload/`): renders UI, translates strings, handles user input, calls IPC. Contains React components, Zustand stores, TanStack Query wrappers, i18n resources, page layouts, and Electron IPC transport code. Contains **no** business rules and **no** direct database access.

**Domain** (`packages/domain/src/`): the portable core — a standalone workspace package consumed by `apps/desktop` today and by `apps/api` / `apps/web` later. It also owns the sync engine (`sync/`) and the `SyncHubPort`; hub implementations (embedded server, cloud API) are adapters like any other. Entities, value objects, use cases, ports (repository / service interfaces), business policies (invoice math, conflict detection, plan gating), domain errors. Written in pure TypeScript. Compiles with `tsconfig.domain.json` which excludes `dom` and infrastructure paths. Depends on nothing outside itself.

**Data** (`apps/desktop/src/data/`): concrete adapters that implement the domain's ports. SQLCipher/SQLite repositories via `better-sqlite3-multiple-ciphers` (one encrypted DB file per center), the `SyncHubPort` HTTP client (`data/sync/`), PDF renderer via `pdf-lib`, Excel via `exceljs`, filesystem helpers. This is the only layer allowed to touch external I/O.

The wiring happens once, in `apps/desktop/src/main/composition-root.ts`. Nowhere else.

---

## The forbidden imports table

Memorize this. It is the ground truth.

| From layer | May import from | May **not** import from |
|---|---|---|
| Domain | Domain only | Renderer, Data, Main, Preload, `better-sqlite3`, `fs`, `path`, `os`, `child_process`, `electron`, `react`, `exceljs`, `pdf-lib`, browser globals |
| Data | Domain, Node built-ins, `better-sqlite3`, `exceljs`, `pdf-lib` | Renderer, React, `electron/renderer` |
| Renderer | Domain (types + errors only), other renderer files | Data, Main, `better-sqlite3`, `fs`, `electron` (except via `window.api` from preload) |
| Main / IPC | Domain, Data, composition root | Renderer |
| Preload | Domain (types only), `electron` | Data, Renderer |

ESLint is configured with `eslint-plugin-boundaries` (or `import/no-restricted-paths`) to fail on any violation. If ESLint doesn't catch it, fix ESLint too.

Renderer may import **types and error classes** from the domain, because those are portable and non-executable. It may not import use case implementations directly — use cases run in the main process behind IPC.

---

## Step 1 — When adding a new feature, decide the layer per artifact

Every new feature produces several artifacts. Sort them into layers before writing anything.

Example: "Add support for parents linked to students."

| Artifact | Layer | File |
|---|---|---|
| `Parent` entity type | Domain | `packages/domain/src/entities/parent.ts` |
| `ParentRepository` port | Domain | `packages/domain/src/ports/parent-repository.ts` |
| `CreateParent` use case | Domain | `packages/domain/src/use-cases/create-parent.ts` |
| `LinkParentToStudent` use case | Domain | `packages/domain/src/use-cases/link-parent-to-student.ts` |
| SQLite table + migration | Data | `apps/desktop/src/data/sqlite/migrations/0007_parents.sql` |
| `SqliteParentRepository` | Data | `apps/desktop/src/data/sqlite/repositories/parent-repository.ts` |
| IPC handler `parent.create` | Main (Presentation) | `apps/desktop/src/main/ipc/parent.ts` |
| Preload bridge method | Preload | `apps/desktop/src/preload/index.ts` |
| `useCreateParent` hook | Renderer | `apps/desktop/src/renderer/hooks/parent/use-create-parent.ts` |
| Parents tab UI | Renderer | `apps/desktop/src/renderer/pages/students/parents-tab.tsx` |
| i18n strings | Renderer | `apps/desktop/src/renderer/i18n/fr.json` + `ar.json` |
| Composition root wiring | Main | `apps/desktop/src/main/composition-root.ts` |
| Unit tests for use cases | Tests | `tests/unit/domain/use-cases/*.test.ts` |
| Integration tests for repo | Tests | `tests/integration/data/parent-repository.test.ts` |
| E2E for the tab | Tests | `tests/e2e/students-parents.spec.ts` |

Commit order: Domain → Data → Composition root + IPC → Preload → Renderer → E2E. Each commit compiles, types, and passes tests on its own.

---

## Step 2 — Write the domain first, with no infrastructure in sight

The domain is written test-first. Because it has no dependencies, tests are trivial and fast.

### Ports — the shape of what Domain needs

Ports are interfaces the domain declares. Narrow them per use case (interface segregation).

```ts
// packages/domain/src/ports/parent-repository.ts
import type { Parent } from '../entities/parent';
import type { ParentId, StudentId } from '../value-objects/ids';

export interface ParentRepository {
  save(parent: Parent): Promise<void>;
  findById(id: ParentId): Promise<Parent | null>;
  findByStudentId(studentId: StudentId): Promise<readonly Parent[]>;
  findByNaturalKey(naturalKey: string): Promise<Parent | null>;
}
```

### Use cases — the shape of what Domain does

Use cases are classes with a single `execute` method (or functions if truly stateless). They take ports and policies in the constructor and are pure with respect to their inputs.

```ts
// packages/domain/src/use-cases/create-parent.ts
import type { ParentRepository } from '../ports/parent-repository';
import type { Clock } from '../ports/clock';
import type { IdGenerator } from '../ports/id-generator';
import { PlanPolicy } from '../plans/plan-policy';
import { ParentAlreadyExistsError } from '../errors/parent-errors';
import { normalizeNaturalKey } from '../policies/natural-key';
import type { CenterCode } from '../value-objects/center-code';

export type CreateParentInput = {
  fullName: string;
  phone: string;
  email?: string;
  relationship: 'father' | 'mother' | 'guardian' | 'other';
  centerCode: CenterCode;
};

export class CreateParent {
  constructor(
    private readonly parents: ParentRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly plan: PlanPolicy,
  ) {}

  async execute(input: CreateParentInput): Promise<Parent> {
    this.plan.require('core.parents');

    const naturalKey = normalizeNaturalKey({
      centerCode: input.centerCode,
      fullName: input.fullName,
      contact: input.email ?? input.phone,
    });

    const existing = await this.parents.findByNaturalKey(naturalKey);
    if (existing && !existing.deletedAt) {
      throw new ParentAlreadyExistsError(existing.id);
    }

    const now = this.clock.now();
    const parent: Parent = {
      id: this.ids.newParentId(),
      naturalKey,
      // ... fields ...
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    await this.parents.save(parent);
    return parent;
  }
}
```

Everything the use case needs is a constructor dependency. No `import Database from 'better-sqlite3'`, no `import { app } from 'electron'`, no `import fs from 'fs'`. Ever.

### Test the use case with in-memory fakes

```ts
// tests/unit/domain/use-cases/create-parent.test.ts
import { InMemoryParentRepository } from '../fakes/in-memory-parent-repository';
import { fakeClock, fakeIds, fakePlan } from '../fakes';
```

Fakes live in `tests/unit/domain/fakes/` and are also pure TypeScript. Never point a unit test at a real SQLite file.

---

## Step 3 — Write the data adapter to implement the port

The SQLite adapter's only responsibility is to translate between the port's calls and SQL. No business decisions live here.

```ts
// apps/desktop/src/data/sqlite/repositories/parent-repository.ts
import type Database from 'better-sqlite3';
import type { ParentRepository } from '~/domain/ports/parent-repository';
import type { Parent } from '~/domain/entities/parent';

export class SqliteParentRepository implements ParentRepository {
  constructor(private readonly db: Database.Database) {}

  async save(parent: Parent): Promise<void> {
    this.db
      .prepare(
        `INSERT INTO parents (...) VALUES (...)
         ON CONFLICT(id) DO UPDATE SET ...`,
      )
      .run(this.toRow(parent));
  }

  async findById(id: ParentId): Promise<Parent | null> {
    const row = this.db.prepare(`SELECT ... WHERE id = ?`).get(id);
    return row ? this.fromRow(row) : null;
  }
  // ...
}
```

If you find yourself writing an `if` statement here that decides business behavior — like "if the parent's email is empty, generate one" — stop. That belongs in the domain.

Integration tests for the adapter use `better-sqlite3(':memory:')`, run migrations, and hammer the port surface. They live in `tests/integration/`.

---

## Step 4 — Wire in the composition root

`apps/desktop/src/main/composition-root.ts` is the **only** file allowed to construct concrete adapters and pass them to use cases.

```ts
// apps/desktop/src/main/composition-root.ts
export function buildContainer(db: Database.Database, plan: Plan) {
  const clock: Clock = { now: () => new Date() };
  const ids: IdGenerator = { /* ulid-based */ };
  const planPolicy = new PlanPolicy(plan);

  const parentRepo = new SqliteParentRepository(db);
  const studentRepo = new SqliteStudentRepository(db);

  return {
    createParent: new CreateParent(parentRepo, clock, ids, planPolicy),
    linkParentToStudent: new LinkParentToStudent(parentRepo, studentRepo, clock, planPolicy),
    // ...
  };
}
```

IPC handlers take the container and dispatch. They are thin.

```ts
// apps/desktop/src/main/ipc/parent.ts
export function registerParentIpc(container: Container) {
  ipcMain.handle('parent.create', async (_e, input: CreateParentInput) => {
    return container.createParent.execute(input);
  });
}
```

---

## Step 5 — Presentation calls IPC, never the DB

The renderer uses TanStack Query mutations that call the preload-exposed `window.api.parent.create(input)`. No React file ever touches `better-sqlite3` — not even indirectly through a mistakenly imported utility.

```ts
// apps/desktop/src/renderer/hooks/parent/use-create-parent.ts
export function useCreateParent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateParentInput) => window.api.parent.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['parents'] }),
  });
}
```

---

## Step 6 — Domain-in-renderer types are OK; implementations are not

Renderer components may import **types** from the domain:

```ts
import type { Parent } from '~/domain/entities/parent';
import { PlanFeatureUnavailableError } from '~/domain/errors/plan-errors';
```

Types have no runtime cost and are portable. Error classes are portable too because they don't touch infrastructure.

But this is a violation:

```ts
// ❌ NEVER — pulls a use case implementation into the renderer.
import { CreateParent } from '~/domain/use-cases/create-parent';
```

If you see this in a diff, reject it.

---

## Step 7 — Verification before commit

Run in order:

1. `pnpm typecheck:domain` — compiles the domain in isolation with the strict tsconfig. If this fails, you've imported infrastructure into the domain. Fix it now, not later.
2. `pnpm lint` — catches boundary violations via `import/no-restricted-paths`.
3. `pnpm test` — unit tests, all in-memory.
4. `pnpm test:integration` — SQLite adapters against `:memory:`.
5. `grep -R "from 'better-sqlite3'" apps/desktop/src/renderer packages/domain` — must return nothing.
6. `grep -R "from 'react'" packages/domain apps/desktop/src/data` — must return nothing.
7. `grep -R "from 'electron'" packages/domain apps/desktop/src/data` — must return nothing.

If any check fails, the change is not ready to review.

---

## Common mistakes and their fix

| Mistake | Fix |
|---|---|
| Use case reaches into `fs` to save the logo. | Declare a `LogoStorage` port in the domain. Implement it in `apps/desktop/src/data/fs/`. Inject it into the use case. |
| Component computes invoice total inline. | Move the math into a domain policy (`InvoiceMath`). Call it from a use case; expose the total via IPC. |
| Repository throws a raw SQLite error. | Catch and map to a domain error (`ParentAlreadyExistsError`, `RepositoryError`). Domain must not know about `SQLITE_CONSTRAINT`. |
| Use case checks `plan.id === 'premium'`. | Replace with `this.plan.require('feature.name')`. The `PlanPolicy` throws `PlanFeatureUnavailableError`. |
| Renderer imports a domain use case class. | Renderer must call IPC. Use the corresponding hook (`useCreateParent`) which calls `window.api.parent.create`. |
| Migration deletes a column. | Do a soft migration (add new, backfill, deprecate). Never drop live data. |

---

## When to escalate

If a feature *seems* impossible without breaking a layer boundary, stop and design. A properly hexagonal architecture handles PDFs, timers, filesystem, network, and external processes through ports. The right question is always: *"what port would let the domain express this need without knowing how it's fulfilled?"*
